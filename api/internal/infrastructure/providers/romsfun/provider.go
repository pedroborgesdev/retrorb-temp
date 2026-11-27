package romsfun

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/net/html"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/htmlutil"
	"retromancy/api/internal/infrastructure/providers"
	"retromancy/api/internal/ports"
)

const (
	BrowseURL      = "https://romsfun.com/browse-all-roms/"
	DefaultAjaxURL = "https://romsfun.com/wp-admin/admin-ajax.php"
	ProviderID     = "romsfun"
	ProviderLabel  = "RomsFun"
	ProviderDomain = "romsfun.com"
	TimeoutSeconds = 15
	BudgetSeconds  = 18
)

var (
	sizeRe          = regexp.MustCompile(`(?i)\b(\d+(?:\.\d+)?\s*(?:K|M|G|T)(?:B)?)\b`)
	digitsCommaRe   = regexp.MustCompile(`\d{1,3}(?:,\d{3})+|\d+`)
	ratingRe        = regexp.MustCompile(`(?i)data-rateyo-rating=["']([\d.]+)["']`)
	reviewsCountRe  = regexp.MustCompile(`(?i)\(([\d,]+)\s+reviews?\)`)
	consoleNamesMap = map[string]string{
		"game-boy":                       "Game Boy",
		"game-boy-advance":               "Game Boy Advance",
		"game-boy-color":                 "Game Boy Color",
		"nintendo-ds":                    "Nintendo DS",
		"nintendo-3ds":                   "Nintendo 3DS",
		"nintendo-64":                    "Nintendo 64",
		"nintendo-entertainment-system":  "Nintendo Entertainment System",
		"super-nintendo":                 "Super Nintendo",
		"playstation":                    "PlayStation",
		"playstation-2":                  "PlayStation 2",
		"playstation-portable":           "PlayStation Portable",
		"sega-master-system":             "Sega Master System",
		"sega-genesis":                   "Sega Genesis",
	}
)

type downloadOption struct {
	Filename *string
	Type     *string
	Size     *string
	PageURL  string
}

// Provider implements ports.Provider for RomsFun.
type Provider struct {
	clientFactory providers.HTTPClientFactory
	headers       map[string]string
}

// NewProvider builds a RomsFun scraper using the injected HTTP client factory.
func NewProvider(factory providers.HTTPClientFactory) *Provider {
	if factory == nil {
		factory = providers.DefaultClientFactory
	}
	return &Provider{
		clientFactory: factory,
		headers: map[string]string{
			"Accept":     "text/html,application/xhtml+xml",
			"Referer":    "https://romsfun.com/",
			"User-Agent": providers.BrowserUserAgent,
		},
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

	client := p.clientFactory(time.Duration(TimeoutSeconds) * time.Second)
	body, err := providers.DoGet(
		ctx,
		client,
		searchURL(page),
		map[string]string{"q": normalized, "sort": "downloads"},
		p.headers,
		ProviderLabel,
	)
	if err != nil {
		return domain.SearchPage{}, fmt.Errorf("não foi possível pesquisar no RomsFun: %w", err)
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
		return n.Data == "div" && htmlutil.HasClass(n, "rf-li")
	})
	results := make([]domain.SearchResult, 0, len(cards))
	for _, card := range cards {
		resultURL, title, ok := extractResultIdentity(card)
		if !ok {
			continue
		}
		downloads, size := extractCardStats(card)
		results = append(results, domain.SearchResult{
			Title:     providers.StrIfNotEmpty(title),
			URL:       providers.StrIfNotEmpty(resultURL),
			Icon:      extractCardIcon(card, resultURL),
			Console:   consoleFromURL(resultURL),
			Size:      size,
			Downloads: downloads,
		})
	}
	return results
}

func (p *Provider) HasNextPage(pageHTML string, currentPage int) bool {
	doc, err := htmlutil.ParseHTML(pageHTML)
	if err != nil {
		return false
	}
	expectedPath := fmt.Sprintf("/browse-all-roms/page/%d/", currentPage+1)
	anchors := htmlutil.FindAll(doc, func(n *html.Node) bool {
		return n.Data == "a"
	})
	for _, anchor := range anchors {
		ariaLabel, _ := htmlutil.Attr(anchor, "aria-label")
		if !strings.EqualFold(ariaLabel, "next") && !htmlutil.HasClass(anchor, "next") {
			continue
		}
		href, ok := htmlutil.Attr(anchor, "href")
		if !ok || href == "" {
			continue
		}
		joined := htmlutil.SafeURLJoin(BrowseURL, href)
		if joined == "" {
			continue
		}
		parsed, err := url.Parse(joined)
		if err == nil && parsed.Scheme == "https" && parsed.Hostname() == ProviderDomain && parsed.Path == expectedPath {
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
	if !validateRomsFunURL(gameURL) {
		return domain.GameDetails{}, domain.BadRequest("A URL deve usar HTTPS e pertencer a romsfun.com.")
	}
	client := p.clientFactory(time.Duration(TimeoutSeconds) * time.Second)
	gameHTML, err := providers.DoGet(ctx, client, gameURL, nil, p.headers, ProviderLabel)
	if err != nil {
		return domain.GameDetails{}, fmt.Errorf("não foi possível carregar os detalhes do jogo no RomsFun: %w", err)
	}

	details, downloadsPageURL := parseGamePage(gameHTML, gameURL)
	if emit != nil {
		emit(providers.CloneGameDetails(details))
	}
	if downloadsPageURL == "" || !validateRomsFunURL(downloadsPageURL) {
		return details, nil
	}

	downloadsHTML, err := providers.DoGet(
		ctx,
		client,
		downloadsPageURL,
		nil,
		providers.BuildHeaders(p.headers, "Referer", gameURL),
		ProviderLabel,
	)
	if err != nil {
		return details, nil
	}

	options := parseDownloadOptions(downloadsHTML, downloadsPageURL)
	if len(options) == 0 {
		return details, nil
	}

	downloads := make([]domain.DownloadDetails, len(options))
	for i, option := range options {
		downloads[i] = domain.DownloadDetails{
			Filename: option.Filename,
			Type:     option.Type,
			Size:     option.Size,
		}
	}
	details.Downloads = downloads
	if emit != nil {
		emit(providers.CloneGameDetails(details))
	}

	var mu sync.Mutex
	providers.ResolveConcurrently(ctx, len(options), 4, func(i int) {
		directURL := p.resolveDirectDownloadURL(ctx, client, options[i])
		resolved := providers.StrIfNotEmpty(directURL)
		if resolved == nil {
			return
		}
		mu.Lock()
		details.Downloads[i].DownloadURL = resolved
		var snap domain.GameDetails
		if emit != nil {
			snap = providers.CloneGameDetails(details)
		}
		mu.Unlock()
		if emit != nil {
			emit(snap)
		}
	})
	return details, nil
}

func (p *Provider) resolveDirectDownloadURL(ctx context.Context, client ports.HTTPDoer, opt downloadOption) string {
	if opt.PageURL == "" || !validateRomsFunURL(opt.PageURL) {
		return ""
	}
	parentReferer := opt.PageURL
	if idx := strings.LastIndexByte(opt.PageURL, '/'); idx > 0 {
		parentReferer = opt.PageURL[:idx]
	}
	variantHTML, err := providers.DoGet(
		ctx,
		client,
		opt.PageURL,
		nil,
		providers.BuildHeaders(p.headers, "Referer", parentReferer),
		ProviderLabel,
	)
	if err != nil {
		return ""
	}

	ajaxURL, candidate := parseVariantPageData(variantHTML, opt.PageURL)
	if validateRomsFunURL(ajaxURL) {
		ajaxBody, err := providers.DoPostForm(
			ctx,
			client,
			ajaxURL,
			nil,
			map[string]string{"action": "k_get_download"},
			providers.BuildHeaders(p.headers,
				"Accept", "application/json",
				"Origin", "https://romsfun.com",
				"Referer", opt.PageURL,
				"X-Requested-With", "XMLHttpRequest",
			),
			ProviderLabel,
		)
		if err == nil {
			var payload struct {
				Success bool `json:"success"`
				Data    struct {
					DownloadURL string `json:"download_url"`
				} `json:"data"`
			}
			if json.Unmarshal([]byte(ajaxBody), &payload) == nil && payload.Success && payload.Data.DownloadURL != "" {
				return payload.Data.DownloadURL
			}
		}
	}
	return candidate
}

func searchURL(page int) string {
	if page <= 1 {
		return BrowseURL
	}
	return htmlutil.SafeURLJoin(BrowseURL, fmt.Sprintf("page/%d/", page))
}

func validateRomsFunURL(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Hostname() == ProviderDomain
}

func extractResultIdentity(card *html.Node) (string, string, bool) {
	h3 := htmlutil.FindFirst(card, func(n *html.Node) bool {
		return n.Data == "h3" && htmlutil.HasClass(n, "rf-li-title")
	})
	if h3 == nil {
		return "", "", false
	}
	a := htmlutil.FindFirst(h3, func(n *html.Node) bool { return n.Data == "a" })
	if a == nil {
		return "", "", false
	}
	href, ok := htmlutil.Attr(a, "href")
	if !ok || href == "" {
		return "", "", false
	}
	resultURL := htmlutil.SafeURLJoin(BrowseURL, href)
	parsed, err := url.Parse(resultURL)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() != ProviderDomain || !strings.HasPrefix(parsed.Path, "/roms/") {
		return "", "", false
	}
	return resultURL, htmlutil.Text(a), true
}

func extractCardIcon(card *html.Node, resultURL string) *string {
	img := htmlutil.FindFirst(card, func(n *html.Node) bool { return n.Data == "img" })
	if img == nil {
		return nil
	}
	src, _ := htmlutil.Attr(img, "src")
	if src == "" {
		src, _ = htmlutil.Attr(img, "data-src")
	}
	if src == "" {
		return nil
	}
	return providers.StrIfNotEmpty(htmlutil.SafeURLJoin(resultURL, src))
}

func consoleFromURL(resultURL string) *string {
	parsed, err := url.Parse(resultURL)
	if err != nil {
		return nil
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) < 3 || parts[0] != "roms" {
		return nil
	}
	slug := strings.ToLower(strings.TrimSpace(parts[1]))
	if slug == "" {
		return nil
	}
	if mapped, ok := consoleNamesMap[slug]; ok {
		return &mapped
	}
	titled := titleWords(strings.ReplaceAll(slug, "-", " "))
	return &titled
}

func titleWords(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		runes := []rune(w)
		if len(runes) > 0 {
			runes[0] = unicode.ToUpper(runes[0])
			words[i] = string(runes)
		}
	}
	return strings.Join(words, " ")
}

func isWordOrDotComma(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '_' || b == '.' || b == ','
}

func extractCardStats(card *html.Node) (*int, *string) {
	stats := htmlutil.FindFirst(card, func(n *html.Node) bool {
		return n.Data == "div" && htmlutil.HasClass(n, "rf-li-stats-m")
	})
	if stats == nil {
		return nil, nil
	}
	text := htmlutil.Text(stats)

	var downloads *int
	for _, loc := range digitsCommaRe.FindAllStringIndex(text, -1) {
		start, end := loc[0], loc[1]
		if start > 0 && isWordOrDotComma(text[start-1]) {
			continue
		}
		if end < len(text) && isWordOrDotComma(text[end]) {
			continue
		}
		if val, err := strconv.Atoi(strings.ReplaceAll(text[start:end], ",", "")); err == nil {
			downloads = &val
			break
		}
	}

	var size *string
	if m := sizeRe.FindStringSubmatch(text); len(m) == 2 {
		size = providers.StrIfNotEmpty(m[1])
	}
	return downloads, size
}

func parseGamePage(pageHTML, pageURL string) (domain.GameDetails, string) {
	doc, _ := htmlutil.ParseHTML(pageHTML)

	var name *string
	if h1 := htmlutil.FindFirst(doc, func(n *html.Node) bool { return n.Data == "h1" }); h1 != nil {
		name = providers.StrIfNotEmpty(htmlutil.Text(h1))
	}

	releaseDate := tableValue(doc, "Release Date")
	publisher := tableValue(doc, "Publisher")
	regions := extractRegions(doc)

	var starsRate *float64
	if m := ratingRe.FindStringSubmatch(pageHTML); len(m) == 2 {
		if v, err := strconv.ParseFloat(m[1], 64); err == nil {
			starsRate = &v
		}
	}

	var reviewsCount *int
	if m := reviewsCountRe.FindStringSubmatch(pageHTML); len(m) == 2 {
		if v, err := strconv.Atoi(strings.ReplaceAll(m[1], ",", "")); err == nil {
			reviewsCount = &v
		}
	}

	details := domain.GameDetails{
		Name:         name,
		Description:  extractDescription(doc),
		ReleaseDate:  releaseDate,
		ReviewsCount: reviewsCount,
		StarsRate:    starsRate,
		Publisher:    publisher,
		Regions:      regions,
		Icon:         findIcon(doc, pageURL),
		Screenshots:  extractScreenshots(doc, pageURL),
		Downloads:    nil,
	}
	return details, findDownloadPageURL(doc, pageURL)
}

func tableValue(doc *html.Node, label string) *string {
	for _, tr := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "tr" }) {
		tds := htmlutil.FindAll(tr, func(n *html.Node) bool { return n.Data == "td" })
		if len(tds) < 2 {
			continue
		}
		if strings.Contains(htmlutil.Text(tds[0]), label) {
			return providers.StrIfNotEmpty(htmlutil.Text(tds[1]))
		}
	}
	return nil
}

func extractRegions(doc *html.Node) []string {
	for _, tr := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "tr" }) {
		tds := htmlutil.FindAll(tr, func(n *html.Node) bool { return n.Data == "td" })
		if len(tds) < 2 || !strings.Contains(htmlutil.Text(tds[0]), "Region") {
			continue
		}
		spans := htmlutil.FindAll(tds[1], func(n *html.Node) bool {
			return n.Data == "span" && htmlutil.HasClass(n, "rf-fl-n")
		})
		var regions []string
		for _, span := range spans {
			if text := htmlutil.Text(span); text != "" {
				regions = append(regions, text)
			}
		}
		if len(regions) > 0 {
			return regions
		}
	}
	return nil
}

func extractDescription(doc *html.Node) *string {
	div := htmlutil.FindFirst(doc, func(n *html.Node) bool {
		return n.Data == "div" && htmlutil.HasClass(n, "revert") && htmlutil.HasClass(n, "page-content")
	})
	if div == nil {
		return nil
	}
	return providers.StrIfNotEmpty(htmlutil.ParagraphText(div))
}

func findIcon(doc *html.Node, pageURL string) *string {
	for _, img := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "img" }) {
		if htmlutil.HasClass(img, "rf-hero-thumb") {
			if src, ok := htmlutil.Attr(img, "src"); ok && src != "" {
				return providers.StrIfNotEmpty(htmlutil.SafeURLJoin(pageURL, src))
			}
		}
	}
	return nil
}

func extractScreenshots(doc *html.Node, pageURL string) []string {
	gallery := htmlutil.FindFirst(doc, func(n *html.Node) bool {
		if n.Data != "div" {
			return false
		}
		id, _ := htmlutil.Attr(n, "id")
		return id == "romGallery"
	})
	if gallery == nil {
		return nil
	}
	seen := make(map[string]struct{})
	var urls []string
	for _, node := range htmlutil.FindAll(gallery, func(n *html.Node) bool {
		_, has := htmlutil.Attr(n, "data-src")
		return has
	}) {
		raw, _ := htmlutil.Attr(node, "data-src")
		joined := htmlutil.SafeURLJoin(pageURL, raw)
		if joined == "" {
			continue
		}
		if _, dup := seen[joined]; !dup {
			seen[joined] = struct{}{}
			urls = append(urls, joined)
		}
	}
	if len(urls) == 0 {
		return nil
	}
	return urls
}

func findDownloadPageURL(doc *html.Node, pageURL string) string {
	for _, a := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "a" }) {
		if !strings.Contains(htmlutil.Text(a), "Download ROM") {
			continue
		}
		if href, ok := htmlutil.Attr(a, "href"); ok && href != "" {
			return htmlutil.SafeURLJoin(pageURL, href)
		}
	}
	return ""
}

func parseDownloadOptions(pageHTML, pageURL string) []downloadOption {
	idx := strings.Index(strings.ToLower(pageHTML), "normal download links")
	if idx < 0 {
		return nil
	}
	doc, err := htmlutil.ParseHTML(pageHTML[idx:])
	if err != nil {
		return nil
	}
	tbody := htmlutil.FindFirst(doc, func(n *html.Node) bool { return n.Data == "tbody" })
	if tbody == nil {
		return nil
	}

	var options []downloadOption
	for _, tr := range htmlutil.FindAll(tbody, func(n *html.Node) bool { return n.Data == "tr" }) {
		cells := htmlutil.FindAll(tr, func(n *html.Node) bool { return n.Data == "td" })
		if len(cells) == 0 {
			continue
		}
		anchor := htmlutil.FindFirst(cells[0], func(n *html.Node) bool { return n.Data == "a" })
		var filename *string
		var optionURL string
		if anchor != nil {
			filename = providers.StrIfNotEmpty(htmlutil.Text(anchor))
			if href, ok := htmlutil.Attr(anchor, "href"); ok && href != "" {
				optionURL = htmlutil.SafeURLJoin(pageURL, href)
			}
		} else {
			filename = providers.StrIfNotEmpty(htmlutil.Text(cells[0]))
		}
		var optType *string
		if len(cells) > 1 {
			optType = providers.StrIfNotEmpty(htmlutil.Text(cells[1]))
		}
		var optSize *string
		if len(cells) > 2 {
			optSize = providers.StrIfNotEmpty(htmlutil.Text(cells[2]))
		}
		if filename == nil && optType == nil && optSize == nil && optionURL == "" {
			continue
		}
		options = append(options, downloadOption{
			Filename: filename,
			Type:     optType,
			Size:     optSize,
			PageURL:  optionURL,
		})
	}
	return options
}

func parseVariantPageData(pageHTML, pageURL string) (string, string) {
	doc, _ := htmlutil.ParseHTML(pageHTML)
	ajaxURL := DefaultAjaxURL
	if container := htmlutil.FindFirst(doc, func(n *html.Node) bool {
		if n.Data != "div" {
			return false
		}
		id, _ := htmlutil.Attr(n, "id")
		return id == "download-container"
	}); container != nil {
		if configured, ok := htmlutil.Attr(container, "data-ajax-url"); ok && configured != "" {
			if joined := htmlutil.SafeURLJoin(pageURL, configured); joined != "" {
				ajaxURL = joined
			}
		}
	}

	candidate := ""
	if link := htmlutil.FindFirst(doc, func(n *html.Node) bool {
		if n.Data != "a" {
			return false
		}
		id, _ := htmlutil.Attr(n, "id")
		return id == "download-link"
	}); link != nil {
		if href, ok := htmlutil.Attr(link, "href"); ok && href != "" {
			candidate = htmlutil.SafeURLJoin(pageURL, href)
		}
	}
	return ajaxURL, candidate
}
