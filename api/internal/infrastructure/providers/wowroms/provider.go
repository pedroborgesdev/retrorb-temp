package wowroms

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	stdhtml "html"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/html"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/htmlutil"
	"retromancy/api/internal/infrastructure/netsec"
	"retromancy/api/internal/infrastructure/providers"
	"retromancy/api/internal/ports"
)

const (
	ListURL        = "https://wowroms.com/en/roms/list"
	ProviderID     = "wowroms"
	ProviderLabel  = "WowRoms"
	ProviderDomain = "wowroms.com"
	TimeoutSeconds = 15
	BudgetSeconds  = 18
)

var (
	fileSizeRe    = regexp.MustCompile(`(?is)File\s*Size\s*:.*?<b\b[^>]*>(.*?)</b>`)
	downloadsRe   = regexp.MustCompile(`(?is)Downlaod\s*:.*?<b\b[^>]*>([\d,.]+)</b>`)
	ajaxLinkRe    = regexp.MustCompile(`\bajaxLinkUrl\s*=\s*["']([^"']+)["']`)
	tagStripRe    = regexp.MustCompile(`<[^>]+>`)
)

// Provider implements ports.Provider and ports.CustomDownloadResolver for WowRoms.
type Provider struct {
	clientFactory providers.HTTPClientFactory
	headers       map[string]string
	nowMillis     func() int64
}

// NewProvider builds a WowRoms scraper using the injected HTTP client factory.
func NewProvider(factory providers.HTTPClientFactory) *Provider {
	if factory == nil {
		factory = providers.DefaultClientFactory
	}
	return &Provider{
		clientFactory: factory,
		headers: map[string]string{
			"Accept":     "text/html,application/xhtml+xml",
			"Referer":    "https://wowroms.com/",
			"User-Agent": providers.BrowserUserAgent,
		},
		nowMillis: func() int64 { return time.Now().UnixMilli() },
	}
}

func (p *Provider) ID() string                 { return ProviderID }
func (p *Provider) Label() string              { return ProviderLabel }
func (p *Provider) Domain() string             { return ProviderDomain }
func (p *Provider) SearchBudgetSeconds() int   { return BudgetSeconds }
func (p *Provider) RequestTimeoutSeconds() int { return TimeoutSeconds }
func (p *Provider) RequestHeaders() map[string]string {
	return providers.BuildHeaders(p.headers)
}

func (p *Provider) Search(ctx context.Context, query string, page int) (domain.SearchPage, error) {
	normalized := strings.TrimSpace(query)
	if normalized == "" {
		return domain.SearchPage{}, domain.BadRequest("Informe o nome do jogo.")
	}
	if err := providers.ValidatePage(page); err != nil {
		return domain.SearchPage{}, err
	}

	params := map[string]string{"search": normalized}
	if page > 1 {
		params["page"] = strconv.Itoa(page)
	}

	client := p.clientFactory(time.Duration(TimeoutSeconds) * time.Second)
	body, err := providers.DoGet(ctx, client, ListURL, params, p.headers, ProviderLabel)
	if err != nil {
		return domain.SearchPage{}, fmt.Errorf("não foi possível pesquisar no WowRoms: %w", err)
	}

	return domain.SearchPage{
		Results: p.ParseSearchResults(body),
		Page:    page,
		HasNext: p.HasNextPage(body, page),
	}, nil
}

func (p *Provider) ParseSearchResults(pageHTML string) []domain.SearchResult {
	doc, err := htmlutil.ParseHTML(pageHTML)
	if err != nil {
		return []domain.SearchResult{}
	}
	cards := htmlutil.FindAll(doc, func(n *html.Node) bool {
		return n.Data == "li" && htmlutil.HasClass(n, "element")
	})
	results := make([]domain.SearchResult, 0, len(cards))
	for _, card := range cards {
		if res := parseSearchCard(card); res != nil {
			results = append(results, *res)
		}
	}
	return results
}

func (p *Provider) HasNextPage(pageHTML string, currentPage int) bool {
	doc, err := htmlutil.ParseHTML(pageHTML)
	if err != nil {
		return false
	}
	expectedPage := strconv.Itoa(currentPage + 1)
	for _, li := range htmlutil.FindAll(doc, func(n *html.Node) bool {
		return n.Data == "li" && htmlutil.HasClass(n, "next")
	}) {
		a := htmlutil.FindFirst(li, func(n *html.Node) bool { return n.Data == "a" })
		if a == nil {
			continue
		}
		href, ok := htmlutil.Attr(a, "href")
		if !ok || href == "" {
			continue
		}
		nextURL := htmlutil.SafeURLJoin(ListURL, href)
		if nextURL == "" {
			continue
		}
		parsed, err := url.Parse(nextURL)
		if err != nil {
			continue
		}
		if parsed.Scheme == "https" &&
			parsed.Hostname() == ProviderDomain &&
			parsed.Path == "/en/roms/list" &&
			parsed.Query().Get("page") == expectedPage {
			return true
		}
	}
	return false
}

func (p *Provider) EnrichConsoleResults(_ context.Context, results []domain.SearchResult, _ func() bool) []domain.SearchResult {
	return results
}

func (p *Provider) Details(ctx context.Context, gameURL string) (domain.GameDetails, error) {
	return p.DetailsStream(ctx, gameURL, nil)
}

func (p *Provider) DetailsStream(
	ctx context.Context,
	gameURL string,
	emit func(domain.GameDetails),
) (domain.GameDetails, error) {
	if !validateWowRomsURL(gameURL) {
		return domain.GameDetails{}, domain.BadRequest("A URL deve usar HTTPS e pertencer a wowroms.com.")
	}
	client := p.clientFactory(time.Duration(TimeoutSeconds) * time.Second)
	gameHTML, err := providers.DoGet(ctx, client, gameURL, nil, p.headers, ProviderLabel)
	if err != nil {
		return domain.GameDetails{}, fmt.Errorf("não foi possível abrir a página do jogo no WowRoms: %w", err)
	}

	details, ajaxURL, downloadPageURL := parseGamePage(gameHTML, gameURL)
	if emit != nil {
		emit(providers.CloneGameDetails(details))
	}

	formData := parseSubmitForm(gameHTML)
	ajaxReferer := gameURL
	if downloadPageURL != "" && validateWowRomsURL(downloadPageURL) && (ajaxURL == "" || len(formData) == 0) {
		dlHTML, err := providers.DoGet(
			ctx,
			client,
			downloadPageURL,
			nil,
			providers.BuildHeaders(p.headers, "Referer", gameURL),
			ProviderLabel,
		)
		if err == nil {
			if ajaxURL == "" {
				ajaxURL = findAjaxURL(dlHTML, downloadPageURL)
			}
			if len(formData) == 0 {
				formData = parseSubmitForm(dlHTML)
			}
			ajaxReferer = downloadPageURL
		}
	}
	if ajaxURL != "" && len(details.Downloads) > 0 {
		if direct := p.resolveDirectURL(ctx, client, ajaxURL, ajaxReferer); direct != "" {
			details.Downloads[0].DownloadURL = &direct
			details.Downloads[0].ProbeReferer = ajaxReferer
			if len(formData) > 0 {
				details.Downloads[0].ProbeMethod = "POST"
				details.Downloads[0].ProbeFormData = formData
			}
			if emit != nil {
				emit(providers.CloneGameDetails(details))
			}
		}
	}
	return details, nil
}

// ResolveDownload resolves the WowRoms direct file URL and any #submitForm POST fields.
func (p *Provider) ResolveDownload(ctx context.Context, gameURL string, fileIndex int, expectedFilename *string) (domain.ProviderDownload, error) {
	if fileIndex != 0 {
		return domain.ProviderDownload{}, domain.NotFound("Arquivo indisponível.")
	}
	if !validateWowRomsURL(gameURL) {
		return domain.ProviderDownload{}, domain.BadGateway("Não foi possível abrir a página do jogo no WowRoms.", nil)
	}

	client := p.clientFactory(time.Duration(TimeoutSeconds) * time.Second)
	gameHTML, err := providers.DoGet(ctx, client, gameURL, nil, p.headers, ProviderLabel)
	if err != nil {
		return domain.ProviderDownload{}, domain.BadGateway("Não foi possível abrir a página do jogo no WowRoms.", err)
	}

	details, ajaxURL, downloadPageURL := parseGamePage(gameHTML, gameURL)
	formData := parseSubmitForm(gameHTML)
	ajaxReferer := gameURL

	if downloadPageURL != "" && (ajaxURL == "" || len(formData) == 0) {
		if !validateWowRomsURL(downloadPageURL) {
			return domain.ProviderDownload{}, domain.BadGateway("Não foi possível abrir a página de download do WowRoms.", nil)
		}
		dlHTML, err := providers.DoGet(
			ctx,
			client,
			downloadPageURL,
			nil,
			providers.BuildHeaders(p.headers, "Referer", gameURL),
			ProviderLabel,
		)
		if err != nil {
			return domain.ProviderDownload{}, domain.BadGateway("Não foi possível abrir a página de download do WowRoms.", err)
		}
		if ajaxURL == "" {
			ajaxURL = findAjaxURL(dlHTML, downloadPageURL)
		}
		if len(formData) == 0 {
			formData = parseSubmitForm(dlHTML)
		}
		ajaxReferer = downloadPageURL
	}

	var directURL string
	if ajaxURL != "" {
		directURL = p.resolveDirectURL(ctx, client, ajaxURL, ajaxReferer)
	}
	if directURL == "" || len(details.Downloads) == 0 {
		return domain.ProviderDownload{}, domain.NotFound("Arquivo indisponível.")
	}

	raw := details.Downloads[0]
	normalizedURL, err := netsec.NormalizeDownloadURL(directURL)
	if err != nil {
		return domain.ProviderDownload{}, err
	}
	rawFilename := netsec.SanitizeFilename(raw.Filename, "download.zip")
	filename := netsec.ResolveDownloadFilename(raw.Filename, &normalizedURL)
	if expectedFilename != nil {
		expectedClean := netsec.SanitizeFilename(expectedFilename, "download.zip")
		if expectedClean != filename && expectedClean != rawFilename {
			return domain.ProviderDownload{}, domain.Conflict("A lista de arquivos mudou. Recarregue a página do jogo.")
		}
	}

	method := "GET"
	if len(formData) > 0 {
		method = "POST"
	}
	return domain.ProviderDownload{
		URL:       normalizedURL,
		Filename:  filename,
		MediaType: raw.Type,
		Size:      raw.Size,
		Method:    method,
		FormData:  formData,
		Referer:   ajaxReferer,
	}, nil
}

func validateWowRomsURL(raw string) bool {
	if raw == "" || strings.Contains(raw, "\\") {
		return false
	}
	for i := 0; i < len(raw); i++ {
		if raw[i] < 32 || raw[i] == 127 {
			return false
		}
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return strings.EqualFold(parsed.Scheme, "https") &&
		strings.EqualFold(parsed.Hostname(), ProviderDomain) &&
		parsed.User == nil &&
		(parsed.Port() == "" || parsed.Port() == "443")
}

func parseSearchCard(card *html.Node) *domain.SearchResult {
	titleAnchor := htmlutil.FindFirst(card, func(n *html.Node) bool {
		return n.Data == "a" && htmlutil.HasClass(n, "title-5")
	})
	if titleAnchor == nil {
		return nil
	}
	href, ok := htmlutil.Attr(titleAnchor, "href")
	if !ok || href == "" {
		return nil
	}
	gameURL := htmlutil.SafeURLJoin(ListURL, href)
	if !validateWowRomsURL(gameURL) {
		return nil
	}
	parsed, err := url.Parse(gameURL)
	if err != nil || !strings.HasPrefix(parsed.Path, "/en/roms/") {
		return nil
	}

	title, _ := htmlutil.Attr(titleAnchor, "title")
	if title == "" {
		title = htmlutil.Text(titleAnchor)
	}
	title = htmlutil.CollapseSpaces(title)

	var icon *string
	if img := htmlutil.FindFirst(card, func(n *html.Node) bool { return n.Data == "img" }); img != nil {
		src, _ := htmlutil.Attr(img, "data-src")
		if src == "" {
			src, _ = htmlutil.Attr(img, "src")
		}
		if src != "" {
			icon = providers.StrIfNotEmpty(htmlutil.SafeURLJoin(gameURL, src))
		}
	}

	var console *string
	if ca := htmlutil.FindFirst(card, func(n *html.Node) bool {
		return n.Data == "a" && htmlutil.HasClass(n, "colorRed")
	}); ca != nil {
		console = providers.StrIfNotEmpty(htmlutil.Text(ca))
	}

	rawCard := renderInnerHTML(card)
	var size *string
	if m := fileSizeRe.FindStringSubmatch(rawCard); len(m) == 2 {
		size = providers.StrIfNotEmpty(cleanFragment(m[1]))
	}
	var downloads *int
	if m := downloadsRe.FindStringSubmatch(rawCard); len(m) == 2 {
		if parsed, err := strconv.Atoi(strings.ReplaceAll(m[1], ",", "")); err == nil {
			downloads = &parsed
		}
	}

	return &domain.SearchResult{
		Title:     providers.StrIfNotEmpty(title),
		URL:       &gameURL,
		Icon:      icon,
		Console:   console,
		Size:      size,
		Downloads: downloads,
	}
}

func renderInnerHTML(n *html.Node) string {
	var b strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		_ = html.Render(&b, c)
	}
	return b.String()
}

func cleanFragment(fragment string) string {
	return htmlutil.CollapseSpaces(stdhtml.UnescapeString(tagStripRe.ReplaceAllString(fragment, " ")))
}

func parseGamePage(pageHTML, pageURL string) (domain.GameDetails, string, string) {
	doc, _ := htmlutil.ParseHTML(pageHTML)

	var name *string
	if h1 := htmlutil.FindFirst(doc, func(n *html.Node) bool {
		if n.Data != "h1" {
			return false
		}
		id, _ := htmlutil.Attr(n, "id")
		return id == "page-product-title"
	}); h1 != nil {
		name = providers.StrIfNotEmpty(htmlutil.Text(h1))
	}

	year := labeledValue(doc, "Year")
	var releaseDate *string
	if year != nil && *year != "0" {
		releaseDate = year
	}

	region := labeledValue(doc, "Region")
	var regions []string
	if region != nil && !strings.EqualFold(*region, "unknown") {
		regions = []string{*region}
	}

	filename := labeledValue(doc, "File Name")
	size := labeledValue(doc, "File Size")
	ajaxURL := findAjaxURL(pageHTML, pageURL)
	downloadPageURL := findDownloadPageURL(doc, pageURL)

	var downloads []domain.DownloadDetails
	if filename != nil || size != nil || ajaxURL != "" || downloadPageURL != "" {
		downloads = []domain.DownloadDetails{{
			Filename:    filename,
			Type:        nil,
			Size:        size,
			DownloadURL: nil,
		}}
	}

	details := domain.GameDetails{
		Name:         name,
		Description:  metaDescription(doc),
		ReleaseDate:  releaseDate,
		ReviewsCount: nil,
		StarsRate:    nil,
		Publisher:    nil,
		Regions:      regions,
		Icon:         findIcon(doc, pageURL),
		Screenshots:  nil,
		Downloads:    downloads,
	}
	return details, ajaxURL, downloadPageURL
}

func metaDescription(doc *html.Node) *string {
	for _, meta := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "meta" }) {
		name, _ := htmlutil.Attr(meta, "name")
		if strings.EqualFold(name, "description") {
			content, _ := htmlutil.Attr(meta, "content")
			return providers.StrIfNotEmpty(htmlutil.CollapseSpaces(content))
		}
	}
	return nil
}

func labeledValue(doc *html.Node, expected string) *string {
	target := strings.TrimSpace(strings.TrimSuffix(expected, ":"))
	for _, li := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "li" }) {
		span := htmlutil.FindFirst(li, func(n *html.Node) bool { return n.Data == "span" })
		if span == nil {
			continue
		}
		found := strings.TrimSpace(strings.TrimSuffix(htmlutil.Text(span), ":"))
		if !strings.EqualFold(found, target) {
			continue
		}
		if b := htmlutil.FindFirst(li, func(n *html.Node) bool { return n.Data == "b" }); b != nil {
			return providers.StrIfNotEmpty(htmlutil.Text(b))
		}
		return nil
	}
	return nil
}

func findIcon(doc *html.Node, pageURL string) *string {
	for _, img := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "img" }) {
		if !htmlutil.HasClass(img, "imgborder") {
			continue
		}
		src, _ := htmlutil.Attr(img, "src")
		if src == "" {
			src, _ = htmlutil.Attr(img, "data-src")
		}
		if src != "" {
			return providers.StrIfNotEmpty(htmlutil.SafeURLJoin(pageURL, src))
		}
	}
	return nil
}

func findAjaxURL(pageHTML, pageURL string) string {
	m := ajaxLinkRe.FindStringSubmatch(pageHTML)
	if len(m) != 2 {
		return ""
	}
	return htmlutil.SafeURLJoin(pageURL, stdhtml.UnescapeString(m[1]))
}

func findDownloadPageURL(doc *html.Node, pageURL string) string {
	for _, a := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "a" }) {
		if strings.EqualFold(htmlutil.Text(a), "download rom") {
			if href, ok := htmlutil.Attr(a, "href"); ok && href != "" {
				return htmlutil.SafeURLJoin(pageURL, href)
			}
		}
	}
	return ""
}

func parseSubmitForm(pageHTML string) map[string]string {
	doc, err := htmlutil.ParseHTML(pageHTML)
	if err != nil {
		return nil
	}
	form := htmlutil.FindFirst(doc, func(n *html.Node) bool {
		if n.Data != "form" {
			return false
		}
		id, _ := htmlutil.Attr(n, "id")
		return id == "submitForm"
	})
	if form == nil {
		return nil
	}
	data := make(map[string]string)
	for _, input := range htmlutil.FindAll(form, func(n *html.Node) bool { return n.Data == "input" }) {
		name, ok := htmlutil.Attr(input, "name")
		if !ok || name == "" {
			continue
		}
		val, _ := htmlutil.Attr(input, "value")
		data[name] = val
	}
	if len(data) == 0 {
		return nil
	}
	return data
}

func (p *Provider) resolveDirectURL(ctx context.Context, client ports.HTTPDoer, ajaxURL, referer string) string {
	if !validateWowRomsURL(ajaxURL) {
		return ""
	}
	key := strconv.FormatInt(p.nowMillis(), 10)
	sum := md5.Sum([]byte(key))
	token := hex.EncodeToString(sum[:])

	body, err := providers.DoPostForm(
		ctx,
		client,
		ajaxURL,
		map[string]string{"k": key, "t": token},
		nil,
		providers.BuildHeaders(p.headers,
			"Accept", "application/json",
			"Origin", "https://wowroms.com",
			"Referer", referer,
			"X-Requested-With", "XMLHttpRequest",
		),
		ProviderLabel,
	)
	if err != nil {
		return ""
	}
	var payload struct {
		Success bool   `json:"s"`
		Link    string `json:"link"`
	}
	if err := json.Unmarshal([]byte(body), &payload); err != nil || !payload.Success {
		return ""
	}
	link := strings.TrimSpace(payload.Link)
	parsed, err := url.Parse(link)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" {
		return ""
	}
	return link
}
