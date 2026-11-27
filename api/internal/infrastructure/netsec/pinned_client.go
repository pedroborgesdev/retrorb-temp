package netsec

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

const (
	// BrowserUserAgent mimics a desktop browser when fetching upstream ROM portals.
	BrowserUserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36"
	maxRedirects     = 5
)

var knownDownloadExtensions = map[string]struct{}{
	".zip": {}, ".7z": {}, ".rar": {}, ".gz": {}, ".tar": {}, ".iso": {}, ".chd": {}, ".rvz": {},
	".cso": {}, ".wbfs": {}, ".pbp": {}, ".cia": {}, ".3ds": {}, ".nds": {}, ".nsp": {}, ".xci": {},
	".gba": {}, ".gb": {}, ".gbc": {}, ".nes": {}, ".sfc": {}, ".smc": {}, ".n64": {}, ".z64": {},
	".v64": {}, ".gcm": {}, ".md": {}, ".gen": {}, ".sms": {}, ".gg": {}, ".rom": {}, ".bin": {},
}

var (
	invalidFilenameCharsRe = regexp.MustCompile(`[<>:"/\\|?*]`)
	rangeHeaderRe          = regexp.MustCompile(`(?i)^bytes=(\d+)-$`)
	extraReservedCIDRs     []*net.IPNet
)

func init() {
	for _, cidr := range []string{
		"100.64.0.0/10",
		"192.0.0.0/24",
		"192.0.2.0/24",
		"198.18.0.0/15",
		"198.51.100.0/24",
		"203.0.113.0/24",
		"240.0.0.0/4",
		"2001:db8::/32",
		"100::/64",
	} {
		_, network, err := net.ParseCIDR(cidr)
		if err == nil && network != nil {
			extraReservedCIDRs = append(extraReservedCIDRs, network)
		}
	}
}

// SystemResolver resolves hostnames using the OS DNS resolver.
type SystemResolver struct{}

// LookupIPAddr implements ports.IPResolver via net.DefaultResolver.
func (SystemResolver) LookupIPAddr(ctx context.Context, host string) ([]string, error) {
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	seen := make(map[string]struct{}, len(addrs))
	out := make([]string, 0, len(addrs))
	for _, addr := range addrs {
		ipStr := addr.IP.String()
		if _, exists := seen[ipStr]; !exists {
			seen[ipStr] = struct{}{}
			out = append(out, ipStr)
		}
	}
	return out, nil
}

// SanitizeFilename returns a portable basename safe for Content-Disposition and disk.
func SanitizeFilename(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	normalized := strings.ReplaceAll(*value, "\\", "/")
	parts := strings.Split(normalized, "/")
	basename := parts[len(parts)-1]

	var clean strings.Builder
	clean.Grow(len(basename))
	for i := 0; i < len(basename); i++ {
		if basename[i] >= 32 && basename[i] != 127 {
			clean.WriteByte(basename[i])
		}
	}
	res := invalidFilenameCharsRe.ReplaceAllString(clean.String(), "_")
	res = strings.Trim(res, " .")
	if res == "" || res == "." || res == ".." {
		return fallback
	}
	if len(res) > 180 {
		dot := strings.LastIndexByte(res, '.')
		if dot > 0 && dot < len(res)-1 {
			stem := res[:dot]
			suffix := res[dot+1:]
			if len(stem) > 150 {
				stem = stem[:150]
			}
			if len(suffix) > 20 {
				suffix = suffix[:20]
			}
			res = stem + "." + suffix
		} else {
			res = res[:180]
		}
	}
	return res
}

// ParseRangeStart parses an open-ended HTTP byte Range header (`bytes=<start>-`).
func ParseRangeStart(value string) (*int64, error) {
	stripped := strings.TrimSpace(value)
	if stripped == "" {
		return nil, nil
	}
	matches := rangeHeaderRe.FindStringSubmatch(stripped)
	if len(matches) != 2 {
		return nil, domain.BadRequest("Intervalo de download inválido.")
	}
	start, err := strconv.ParseInt(matches[1], 10, 64)
	if err != nil || start < 0 {
		return nil, domain.BadRequest("Intervalo de download inválido.")
	}
	if start == 0 {
		return nil, nil
	}
	return &start, nil
}

// NormalizeDownloadURL validates syntax and percent-encodes spaces/non-ASCII in path and query.
func NormalizeDownloadURL(value string) (string, error) {
	if value == "" || value != strings.TrimSpace(value) || len(value) > 4096 ||
		strings.Contains(value, "\\") || strings.Contains(value, "#") {
		return "", domain.BadRequest("URL de download inválida.")
	}
	for i := 0; i < len(value); i++ {
		if value[i] < 32 || value[i] == 127 {
			return "", domain.BadRequest("URL de download inválida.")
		}
	}

	schemeEnd := strings.Index(value, "://")
	if schemeEnd <= 0 {
		return "", domain.BadRequest("URL de download inválida.")
	}
	rawScheme := value[:schemeEnd]
	if strings.ContainsRune(rawScheme, ' ') {
		return "", domain.BadRequest("URL de download inválida.")
	}
	rest := value[schemeEnd+3:]
	netlocEnd := strings.IndexAny(rest, "/?#")
	rawNetloc := rest
	if netlocEnd >= 0 {
		rawNetloc = rest[:netlocEnd]
	}
	if strings.ContainsRune(rawNetloc, ' ') {
		return "", domain.BadRequest("URL de download inválida.")
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return "", domain.BadRequest("URL de download inválida.")
	}
	host := strings.ToLower(parsed.Hostname())
	port := parsed.Port()
	if strings.ToLower(parsed.Scheme) != "https" ||
		host == "" ||
		(port != "" && port != "443") ||
		parsed.User != nil ||
		((host == "romsfun.com" || host == "www.romsfun.com") && strings.HasPrefix(parsed.Path, "/download/")) {
		return "", domain.BadRequest("URL de download inválida.")
	}

	rawPath := parsed.Path
	if parsed.RawPath != "" {
		rawPath = parsed.RawPath
	}
	encodedPath := percentEncodePreserve(rawPath, "/:@!$&'()*+,;=-._~%")
	encodedQuery := percentEncodePreserve(parsed.RawQuery, "=&+/:@!$'()*,;=-._~%")

	var out strings.Builder
	out.WriteString("https://")
	out.WriteString(parsed.Host)
	out.WriteString(encodedPath)
	if encodedQuery != "" {
		out.WriteByte('?')
		out.WriteString(encodedQuery)
	}
	return out.String(), nil
}

func percentEncodePreserve(input, safeChars string) string {
	var b strings.Builder
	b.Grow(len(input))
	const hex = "0123456789ABCDEF"
	for i := 0; i < len(input); i++ {
		c := input[i]
		if (c >= 'A' && c <= 'Z') ||
			(c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') ||
			strings.IndexByte(safeChars, c) >= 0 {
			b.WriteByte(c)
		} else {
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&0x0F])
		}
	}
	return b.String()
}

// ResolveDownloadFilename appends a known archive/ROM extension from downloadURL when missing.
func ResolveDownloadFilename(filename *string, downloadURL *string) string {
	sanitized := SanitizeFilename(filename, "download.zip")
	if downloadURL == nil || *downloadURL == "" {
		return sanitized
	}
	if _, known := knownDownloadExtensions[strings.ToLower(filepath.Ext(sanitized))]; known {
		return sanitized
	}
	parsed, err := url.Parse(*downloadURL)
	if err != nil {
		return sanitized
	}
	decodedPath, err := url.PathUnescape(parsed.Path)
	if err != nil {
		decodedPath = parsed.Path
	}
	urlExt := strings.ToLower(filepath.Ext(decodedPath))
	if _, known := knownDownloadExtensions[urlExt]; known && urlExt != ".bin" {
		combined := sanitized + urlExt
		return SanitizeFilename(&combined, "download.zip")
	}
	return sanitized
}

// NormalizeGameDownloads validates download URLs and resolves filenames on game details.
func NormalizeGameDownloads(details domain.GameDetails) domain.GameDetails {
	if len(details.Downloads) == 0 {
		return details
	}
	normalized := make([]domain.DownloadDetails, len(details.Downloads))
	for i, entry := range details.Downloads {
		copyEntry := entry
		if copyEntry.DownloadURL != nil {
			trimmed := strings.TrimSpace(*copyEntry.DownloadURL)
			if trimmed == "" {
				copyEntry.DownloadURL = nil
			} else if cleanURL, err := NormalizeDownloadURL(trimmed); err != nil {
				copyEntry.DownloadURL = nil
			} else {
				copyEntry.DownloadURL = &cleanURL
			}
		}
		if copyEntry.Filename != nil && strings.TrimSpace(*copyEntry.Filename) != "" {
			resolved := ResolveDownloadFilename(copyEntry.Filename, copyEntry.DownloadURL)
			copyEntry.Filename = &resolved
		}
		normalized[i] = copyEntry
	}
	details.Downloads = normalized
	return details
}

// IsPublicIP reports whether rawIP is globally routable (blocking loopback, RFC1918, CGNAT, link-local, ULA, docs).
func IsPublicIP(rawIP string) (bool, error) {
	ip := net.ParseIP(rawIP)
	if ip == nil {
		return false, domain.BadRequest("URL de download inválida.")
	}
	if !ip.IsGlobalUnicast() ||
		ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified() {
		return false, nil
	}
	for _, cidr := range extraReservedCIDRs {
		if cidr.Contains(ip) {
			return false, nil
		}
	}
	return true, nil
}

// PublicAddresses resolves hostname and ensures every address returned is public.
func PublicAddresses(ctx context.Context, resolver ports.IPResolver, hostname string) ([]string, error) {
	addrs, err := resolver.LookupIPAddr(ctx, hostname)
	if err != nil || len(addrs) == 0 {
		return nil, domain.BadGateway("Não foi possível resolver o servidor de download.", err)
	}
	for _, addr := range addrs {
		ok, parseErr := IsPublicIP(addr)
		if parseErr != nil {
			return nil, parseErr
		}
		if !ok {
			return nil, domain.BadRequest("URL de download com destino não permitido.")
		}
	}
	return addrs, nil
}

// EnsurePublicHTTPSURL validates syntax and DNS results for targetURL.
func EnsurePublicHTTPSURL(ctx context.Context, resolver ports.IPResolver, targetURL string) (string, []string, error) {
	normalized, err := NormalizeDownloadURL(targetURL)
	if err != nil {
		return "", nil, err
	}
	parsed, err := url.Parse(normalized)
	if err != nil || parsed.Hostname() == "" {
		return "", nil, domain.BadRequest("URL de download inválida.")
	}
	addrs, err := PublicAddresses(ctx, resolver, parsed.Hostname())
	if err != nil {
		return "", nil, err
	}
	return normalized, addrs, nil
}

// TransportFactory constructs a per-hop HTTP RoundTripper pinned to resolvedIP while keeping TLS SNI as serverName.
type TransportFactory func(pinnedIP, serverName string) http.RoundTripper

// PinnedDownloader opens HTTPS download streams bound to DNS-validated public IPs across every redirect.
type PinnedDownloader struct {
	resolver         ports.IPResolver
	transportFactory TransportFactory
}

// NewPinnedDownloader builds a PinnedDownloader with default pinned TLS transport.
func NewPinnedDownloader(resolver ports.IPResolver) *PinnedDownloader {
	if resolver == nil {
		resolver = SystemResolver{}
	}
	return &PinnedDownloader{
		resolver:         resolver,
		transportFactory: defaultPinnedTransport,
	}
}

// NewPinnedDownloaderWithTransport allows tests to supply custom pinned RoundTrippers.
func NewPinnedDownloaderWithTransport(resolver ports.IPResolver, factory TransportFactory) *PinnedDownloader {
	if resolver == nil {
		resolver = SystemResolver{}
	}
	if factory == nil {
		factory = defaultPinnedTransport
	}
	return &PinnedDownloader{
		resolver:         resolver,
		transportFactory: factory,
	}
}

func defaultPinnedTransport(pinnedIP, serverName string) http.RoundTripper {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	return &http.Transport{
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, net.JoinHostPort(pinnedIP, "443"))
		},
		TLSClientConfig: &tls.Config{
			ServerName: serverName,
			MinVersion: tls.VersionTLS12,
		},
		ResponseHeaderTimeout: 60 * time.Second,
		DisableCompression:    true,
		MaxIdleConns:          1,
	}
}

type pinnedBody struct {
	io.ReadCloser
	cleanup func()
}

func (p *pinnedBody) Close() error {
	err := p.ReadCloser.Close()
	if p.cleanup != nil {
		p.cleanup()
	}
	return err
}

// OpenPinned opens targetURL via DNS-pinned hops, forwarding cookies/Referer/Range and blocking HTML/SSRF.
func (d *PinnedDownloader) OpenPinned(
	ctx context.Context,
	targetURL string,
	opts ports.OpenPinnedOptions,
) (io.ReadCloser, int, http.Header, error) {
	userAgent := strings.TrimSpace(opts.UserAgent)
	if userAgent == "" {
		userAgent = BrowserUserAgent
	}
	currentURL := targetURL
	currentMethod := strings.ToUpper(strings.TrimSpace(opts.Method))
	if currentMethod == "" {
		currentMethod = http.MethodGet
	}

	var currentBody string
	if currentMethod == http.MethodPost && len(opts.FormData) > 0 {
		form := url.Values{}
		for k, v := range opts.FormData {
			form.Set(k, v)
		}
		currentBody = form.Encode()
	}

	jar, _ := cookiejar.New(nil)

	for redirectCount := 0; redirectCount <= maxRedirects; redirectCount++ {
		validatedURL, addrs, err := EnsurePublicHTTPSURL(ctx, d.resolver, currentURL)
		if err != nil {
			return nil, 0, nil, err
		}
		parsed, _ := url.Parse(validatedURL)
		hostname := parsed.Hostname()
		pinnedIP := addrs[0]

		var bodyReader io.Reader
		if currentBody != "" {
			bodyReader = strings.NewReader(currentBody)
		}
		req, err := http.NewRequestWithContext(ctx, currentMethod, validatedURL, bodyReader)
		if err != nil {
			return nil, 0, nil, domain.BadGateway("Não foi possível iniciar o download remoto.", err)
		}
		req.Host = hostname
		req.Header.Set("Accept", "application/octet-stream,application/zip,application/x-7z-compressed,*/*")
		req.Header.Set("Accept-Encoding", "identity")
		req.Header.Set("User-Agent", userAgent)
		if opts.Referer != "" {
			req.Header.Set("Referer", opts.Referer)
		}
		if currentMethod == http.MethodPost && currentBody != "" {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			if refParsed, refErr := url.Parse(opts.Referer); refErr == nil && refParsed.Scheme != "" && refParsed.Host != "" {
				req.Header.Set("Origin", refParsed.Scheme+"://"+refParsed.Host)
			}
		}
		if opts.RangeStart != nil && *opts.RangeStart > 0 {
			req.Header.Set("Range", fmt.Sprintf("bytes=%d-", *opts.RangeStart))
		}
		for _, cookie := range jar.Cookies(req.URL) {
			req.AddCookie(cookie)
		}

		transport := d.transportFactory(pinnedIP, hostname)
		client := &http.Client{
			Transport: transport,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}

		resp, err := client.Do(req)
		if err != nil {
			closeTransport(transport)
			return nil, 0, nil, domain.BadGateway("Não foi possível iniciar o download remoto.", err)
		}
		if cookies := resp.Cookies(); len(cookies) > 0 {
			jar.SetCookies(req.URL, cookies)
		}

		if isRedirectStatus(resp.StatusCode) {
			location := resp.Header.Get("Location")
			_ = resp.Body.Close()
			closeTransport(transport)
			if location == "" || redirectCount >= maxRedirects {
				return nil, 0, nil, domain.BadGateway("O servidor de download excedeu o limite de redirecionamentos.", nil)
			}
			nextRef, parseErr := url.Parse(location)
			if parseErr != nil {
				return nil, 0, nil, domain.BadRequest("URL de download inválida.")
			}
			currentURL = parsed.ResolveReference(nextRef).String()
			if (resp.StatusCode == http.StatusMovedPermanently ||
				resp.StatusCode == http.StatusFound ||
				resp.StatusCode == http.StatusSeeOther) && currentMethod == http.MethodPost {
				currentMethod = http.MethodGet
				currentBody = ""
			}
			continue
		}

		if resp.StatusCode == http.StatusRequestedRangeNotSatisfiable {
			_ = resp.Body.Close()
			closeTransport(transport)
			return nil, 0, nil, domain.NewAppError(http.StatusRequestedRangeNotSatisfiable, "O trecho solicitado não é mais válido no servidor remoto.", nil)
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			_ = resp.Body.Close()
			closeTransport(transport)
			return nil, 0, nil, domain.BadGateway(fmt.Sprintf("O servidor remoto recusou o download (HTTP %d).", resp.StatusCode), nil)
		}

		contentType := strings.ToLower(strings.TrimSpace(strings.SplitN(resp.Header.Get("Content-Type"), ";", 2)[0]))
		if contentType == "text/html" || contentType == "application/xhtml+xml" {
			_ = resp.Body.Close()
			closeTransport(transport)
			return nil, 0, nil, domain.BadGateway("O download remoto retornou uma página HTML em vez do arquivo.", nil)
		}

		wrapped := &pinnedBody{
			ReadCloser: resp.Body,
			cleanup:    func() { closeTransport(transport) },
		}
		return wrapped, resp.StatusCode, resp.Header.Clone(), nil
	}

	return nil, 0, nil, domain.BadGateway("O servidor de download excedeu o limite de redirecionamentos.", nil)
}

func isRedirectStatus(status int) bool {
	return status == http.StatusMovedPermanently ||
		status == http.StatusFound ||
		status == http.StatusSeeOther ||
		status == http.StatusTemporaryRedirect ||
		status == http.StatusPermanentRedirect
}

func closeTransport(rt http.RoundTripper) {
	if tr, ok := rt.(interface{ CloseIdleConnections() }); ok {
		tr.CloseIdleConnections()
	}
}

// VerifyPinnedError wraps err as BadGateway if it is not already an AppError.
func VerifyPinnedError(err error) error {
	var appErr *domain.AppError
	if errors.As(err, &appErr) {
		return err
	}
	return domain.BadGateway("Não foi possível iniciar o download remoto.", err)
}
