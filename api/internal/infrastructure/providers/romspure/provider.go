package romspure

import (
	"context"
	"encoding/json"
	"fmt"
	stdhtml "html"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/htmlutil"
	"retromancy/api/internal/infrastructure/providers"
	"retromancy/api/internal/ports"
)

const (
	SearchURL      = "https://romspure.cc/browse-roms/"
	AjaxURL        = "https://romspure.cc/wp-admin/admin-ajax.php"
	ProviderID     = "romspure"
	ProviderLabel  = "RomsPure"
	ProviderDomain = "romspure.cc"
	TimeoutSeconds = 15
	BudgetSeconds  = 18
)

var (
	imageURLRe         = regexp.MustCompile(`(?i)\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$`)
	visibleDownloadsRe = regexp.MustCompile(`(?i)\b([\d,]+)\s+downloads?\b`)
	ratingRe           = regexp.MustCompile(`(?i)data-rateyo-rating=["']([\d.]+)["']`)
	parenCountRe       = regexp.MustCompile(`\(([\d,]+)\)`)
	trailingDigitsRe   = regexp.MustCompile(`-(\d+)$`)
	optionIndexRe      = regexp.MustCompile(`/(\d+)$`)
	hiddenPostIDRe     = regexp.MustCompile(`(?i)<input\b[^>]*name=["']post_id["'][^>]*value=["'](\d+)["']`)
	jsonLDScriptRe     = regexp.MustCompile(`(?is)<script\b[^>]*type=["']application/ld\+json["'][^>]*>(.*?)</script>`)
)

type downloadOption struct {
	Filename *string
	Type     *string
	Size     *string
	PageURL  string
	PostID   string
	Index    string
}

// Provider implements ports.Provider for RomsPure.
type Provider struct {
	clientFactory providers.HTTPClientFactory
	headers       map[string]string
}

// NewProvider builds a RomsPure scraper using the injected HTTP client factory.
func NewProvider(factory providers.HTTPClientFactory) *Provider {
	if factory == nil {
		factory = providers.DefaultClientFactory
	}
	return &Provider{
		clientFactory: factory,
		headers: map[string]string{
			"Accept":     "text/html,application/xhtml+xml",
			"Referer":    "https://romspure.cc/",
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
		map[string]string{"q": normalized, "sort": "popular"},
		p.headers,
		ProviderLabel,
	)
	if err != nil {
		return domain.SearchPage{}, fmt.Errorf("não foi possível pesquisar no RomsPure: %w", err)
	}

	_, hasMoreTime := providers.BudgetDeadline(BudgetSeconds)
	results := p.ParseSearchResults(body)
	results = p.EnrichConsoleResults(ctx, results, hasMoreTime)

	return domain.SearchPage{
		Results: results,
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
		return n.Data == "article" && htmlutil.HasClass(n, "rom-item")
	})
	results := make([]domain.SearchResult, 0, len(cards))
	for _, card := range cards {
		var resultURL string
		for _, anchor := range htmlutil.FindAll(card, func(n *html.Node) bool { return n.Data == "a" }) {
			href, ok := htmlutil.Attr(anchor, "href")
			if !ok || !strings.Contains(href, "/roms/") {
				continue
			}
			joined := htmlutil.SafeURLJoin(SearchURL, href)
			if parsed, err := url.Parse(joined); err == nil && parsed.Scheme == "https" && parsed.Hostname() == ProviderDomain {
				resultURL = joined
				break
			}
		}
		if resultURL == "" {
			continue
		}

		var title *string
		if h3 := htmlutil.FindFirst(card, func(n *html.Node) bool { return n.Data == "h3" }); h3 != nil {
			title = providers.StrIfNotEmpty(htmlutil.Text(h3))
		}

		var icon *string
		if img := htmlutil.FindFirst(card, func(n *html.Node) bool { return n.Data == "img" }); img != nil {
			if src, ok := htmlutil.Attr(img, "src"); ok && src != "" {
				icon = providers.StrIfNotEmpty(htmlutil.SafeURLJoin(resultURL, src))
			}
		}

		console := textByClassMarker(card, "text-brand-muted truncate")
		if console == nil {
			console = textByClassMarker(card, "bg-brand-goldlight")
		}

		results = append(results, domain.SearchResult{
			Title:     title,
			URL:       &resultURL,
			Icon:      icon,
			Console:   console,
			Size:      textByClassMarker(card, "min-w-[24px]"),
			Downloads: nil,
		})
	}
	return results
}

func (p *Provider) HasNextPage(pageHTML string, currentPage int) bool {
	doc, err := htmlutil.ParseHTML(pageHTML)
	if err != nil {
		return false
	}
	expectedPath := fmt.Sprintf("/browse-roms/page/%d/", currentPage+1)
	for _, anchor := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "a" }) {
		ariaLabel, _ := htmlutil.Attr(anchor, "aria-label")
		if !strings.EqualFold(ariaLabel, "next") && !htmlutil.HasClass(anchor, "next") {
			continue
		}
		href, ok := htmlutil.Attr(anchor, "href")
		if !ok || href == "" {
			continue
		}
		joined := htmlutil.SafeURLJoin(SearchURL, href)
		if parsed, err := url.Parse(joined); err == nil && parsed.Scheme == "https" && parsed.Hostname() == ProviderDomain && parsed.Path == expectedPath {
			return true
		}
	}
	return false
}

func (p *Provider) EnrichConsoleResults(ctx context.Context, results []domain.SearchResult, hasMoreTime func() bool) []domain.SearchResult {
	client := p.clientFactory(time.Duration(TimeoutSeconds) * time.Second)
	headers := providers.BuildHeaders(p.headers, "Referer", SearchURL)
	for i := range results {
		if results[i].URL == nil || *results[i].URL == "" {
			continue
		}
		if hasMoreTime != nil && !hasMoreTime() {
			break
		}
		body, err := providers.DoGet(ctx, client, *results[i].URL, nil, headers, ProviderLabel)
		if err != nil {
			continue
		}
		results[i].Downloads = parseExactDownloadCount(body)
	}
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
	if !validateRomsPureURL(gameURL) {
		return domain.GameDetails{}, domain.BadRequest("A URL deve usar HTTPS e pertencer a romspure.cc.")
	}
	client := p.clientFactory(time.Duration(TimeoutSeconds) * time.Second)
	pageHTML, err := providers.DoGet(ctx, client, gameURL, nil, p.headers, ProviderLabel)
	if err != nil {
		return domain.GameDetails{}, fmt.Errorf("não foi possível abrir a página do jogo no RomsPure: %w", err)
	}

	details, downloadsPageURL := parseGamePage(pageHTML, gameURL)
	if emit != nil {
		emit(providers.CloneGameDetails(details))
	}
	if downloadsPageURL != "" {
		details.Downloads = collectDownloads(ctx, client, p.headers, downloadsPageURL, gameURL, func(dls []domain.DownloadDetails) {
			if emit == nil {
				return
			}
			snap := providers.CloneGameDetails(details)
			snap.Downloads = dls
			emit(snap)
		})
	}
	return details, nil
}

func searchURL(page int) string {
	if page <= 1 {
		return SearchURL
	}
	return htmlutil.SafeURLJoin(SearchURL, fmt.Sprintf("page/%d/", page))
}

func validateRomsPureURL(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Hostname() == ProviderDomain
}

func textByClassMarker(root *html.Node, marker string) *string {
	node := htmlutil.FindFirst(root, func(n *html.Node) bool {
		return (n.Data == "span" || n.Data == "div") && htmlutil.HasClassSubstring(n, marker)
	})
	if node == nil {
		return nil
	}
	return providers.StrIfNotEmpty(htmlutil.Text(node))
}

func parseExactDownloadCount(pageHTML string) *int {
	for _, match := range jsonLDScriptRe.FindAllStringSubmatch(pageHTML, -1) {
		raw := strings.TrimSpace(stdhtml.UnescapeString(match[1]))
		var payload any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			continue
		}
		for _, item := range iterJSONObjects(payload) {
			stat, ok := item["interactionStatistic"].(map[string]any)
			if !ok {
				continue
			}
			var interactionType string
			switch rawType := stat["interactionType"].(type) {
			case string:
				interactionType = rawType
			case map[string]any:
				if t, ok := rawType["@type"].(string); ok {
					interactionType = t
				}
			}
			if interactionType != "DownloadAction" {
				continue
			}
			switch count := stat["userInteractionCount"].(type) {
			case float64:
				v := int(count)
				return &v
			case string:
				clean := strings.ReplaceAll(count, ",", "")
				if v, err := strconv.Atoi(clean); err == nil {
					return &v
				}
			}
		}
	}

	if m := visibleDownloadsRe.FindStringSubmatch(pageHTML); len(m) == 2 {
		if v, err := strconv.Atoi(strings.ReplaceAll(m[1], ",", "")); err == nil {
			return &v
		}
	}
	return nil
}

func iterJSONObjects(value any) []map[string]any {
	var out []map[string]any
	switch typed := value.(type) {
	case map[string]any:
		out = append(out, typed)
		for _, nested := range typed {
			out = append(out, iterJSONObjects(nested)...)
		}
	case []any:
		for _, nested := range typed {
			out = append(out, iterJSONObjects(nested)...)
		}
	}
	return out
}

func infoTile(root *html.Node, label string) *html.Node {
	tiles := htmlutil.FindAll(root, func(n *html.Node) bool {
		return n.Data == "div" && htmlutil.HasClass(n, "rs-info__tile")
	})
	for _, tile := range tiles {
		keyNode := htmlutil.FindFirst(tile, func(n *html.Node) bool {
			return n.Data == "span" && htmlutil.HasClass(n, "rs-info__k")
		})
		if keyNode != nil && strings.EqualFold(htmlutil.Text(keyNode), label) {
			return tile
		}
	}
	return nil
}

func infoValue(root *html.Node, label string) *string {
	tile := infoTile(root, label)
	if tile == nil {
		return nil
	}
	valNode := htmlutil.FindFirst(tile, func(n *html.Node) bool {
		return n.Data == "span" && htmlutil.HasClass(n, "rs-info__v")
	})
	if valNode == nil {
		return nil
	}
	return providers.StrIfNotEmpty(htmlutil.Text(valNode))
}

func extractRegions(root *html.Node) []string {
	tile := infoTile(root, "Region")
	if tile == nil {
		return nil
	}
	seen := make(map[string]struct{})
	var regions []string
	for _, a := range htmlutil.FindAll(tile, func(n *html.Node) bool { return n.Data == "a" }) {
		text := htmlutil.Text(a)
		if text == "" {
			continue
		}
		if _, ok := seen[text]; !ok {
			seen[text] = struct{}{}
			regions = append(regions, text)
		}
	}
	if len(regions) > 0 {
		return regions
	}
	if fallback := infoValue(root, "Region"); fallback != nil {
		return []string{*fallback}
	}
	return nil
}

func sectionByHeading(root *html.Node, headings ...string) *html.Node {
	wanted := make(map[string]struct{}, len(headings))
	for _, h := range headings {
		wanted[strings.ToLower(h)] = struct{}{}
	}
	for _, sec := range htmlutil.FindAll(root, func(n *html.Node) bool { return n.Data == "section" }) {
		h := htmlutil.FindFirst(sec, func(n *html.Node) bool {
			return len(n.Data) == 2 && n.Data[0] == 'h' && n.Data[1] >= '1' && n.Data[1] <= '6'
		})
		if h == nil {
			continue
		}
		if _, ok := wanted[strings.ToLower(htmlutil.Text(h))]; ok {
			return sec
		}
	}
	return nil
}

func extractDescription(root *html.Node) *string {
	sec := sectionByHeading(root, "description")
	if sec == nil {
		return nil
	}
	content := htmlutil.FindFirst(sec, func(n *html.Node) bool {
		return n.Data == "div" && htmlutil.HasClass(n, "entry-content")
	})
	if content == nil {
		return nil
	}
	return providers.StrIfNotEmpty(htmlutil.ParagraphText(content))
}

func extractIcon(root *html.Node, pageURL string, structured map[string]any) *string {
	for _, img := range htmlutil.FindAll(root, func(n *html.Node) bool { return n.Data == "img" }) {
		if htmlutil.HasClass(img, "rs-cover") {
			if src, ok := htmlutil.Attr(img, "src"); ok && src != "" {
				return providers.StrIfNotEmpty(htmlutil.SafeURLJoin(pageURL, src))
			}
		}
	}
	if rawImg, ok := structured["image"].(string); ok && rawImg != "" {
		return providers.StrIfNotEmpty(htmlutil.SafeURLJoin(pageURL, rawImg))
	}
	return nil
}

func extractScreenshots(root *html.Node, pageURL string) []string {
	sec := sectionByHeading(root, "screenshot", "screenshots", "gallery")
	if sec == nil {
		return nil
	}
	seen := make(map[string]struct{})
	var urls []string
	add := func(candidate string) {
		if candidate == "" || !imageURLRe.MatchString(candidate) {
			return
		}
		joined := htmlutil.SafeURLJoin(pageURL, candidate)
		if joined == "" {
			return
		}
		if _, ok := seen[joined]; !ok {
			seen[joined] = struct{}{}
			urls = append(urls, joined)
		}
	}

	linkedAnchors := make(map[*html.Node]struct{})
	for _, a := range htmlutil.FindAll(sec, func(n *html.Node) bool { return n.Data == "a" }) {
		linkedAnchors[a] = struct{}{}
		if href, ok := htmlutil.Attr(a, "href"); ok {
			add(href)
		}
	}

	var walkImgs func(*html.Node)
	walkImgs = func(n *html.Node) {
		if n.Type == html.ElementNode {
			if _, isLinked := linkedAnchors[n]; isLinked {
				return
			}
			if n.Data == "img" {
				src, _ := htmlutil.Attr(n, "data-src")
				if src == "" {
					src, _ = htmlutil.Attr(n, "src")
				}
				add(src)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walkImgs(c)
		}
	}
	walkImgs(sec)
	if len(urls) == 0 {
		return nil
	}
	return urls
}

func extractRating(root *html.Node, pageHTML string, structured map[string]any) (*float64, *int) {
	var stars *float64
	var count *int

	if agg, ok := structured["aggregateRating"].(map[string]any); ok {
		switch v := agg["ratingValue"].(type) {
		case float64:
			stars = &v
		case string:
			if parsed, err := strconv.ParseFloat(v, 64); err == nil {
				stars = &parsed
			}
		}
		switch v := agg["ratingCount"].(type) {
		case float64:
			c := int(v)
			count = &c
		case string:
			if parsed, err := strconv.Atoi(strings.ReplaceAll(v, ",", "")); err == nil {
				count = &parsed
			}
		}
	}

	if stars == nil {
		if m := ratingRe.FindStringSubmatch(pageHTML); len(m) == 2 {
			if parsed, err := strconv.ParseFloat(m[1], 64); err == nil {
				stars = &parsed
			}
		}
	}
	if count == nil {
		if meta := htmlutil.FindFirst(root, func(n *html.Node) bool {
			return n.Data == "span" && htmlutil.HasClass(n, "rs-meta__rating")
		}); meta != nil {
			if m := parenCountRe.FindStringSubmatch(htmlutil.Text(meta)); len(m) == 2 {
				if parsed, err := strconv.Atoi(strings.ReplaceAll(m[1], ",", "")); err == nil {
					count = &parsed
				}
			}
		}
	}
	return stars, count
}

func extractPublisher(root *html.Node, structured map[string]any) *string {
	if visible := infoValue(root, "Publisher"); visible != nil {
		return visible
	}
	switch pub := structured["publisher"].(type) {
	case map[string]any:
		if name, ok := pub["name"].(string); ok && name != "" {
			return &name
		}
	case []any:
		for _, item := range pub {
			if obj, ok := item.(map[string]any); ok {
				if name, ok := obj["name"].(string); ok && name != "" {
					return &name
				}
			}
		}
	}
	return nil
}

func extractDownloadPageURL(root *html.Node, pageURL string) string {
	for _, a := range htmlutil.FindAll(root, func(n *html.Node) bool { return n.Data == "a" }) {
		href, ok := htmlutil.Attr(a, "href")
		if !ok || !strings.Contains(href, "/download/") {
			continue
		}
		if strings.Contains(strings.ToLower(htmlutil.Text(a)), "download") {
			return strings.TrimRight(htmlutil.SafeURLJoin(pageURL, href), "/")
		}
	}
	return ""
}

func parseGamePage(pageHTML, pageURL string) (domain.GameDetails, string) {
	doc, _ := htmlutil.ParseHTML(pageHTML)
	structured := htmlutil.ExtractJSONLDVideoGame(doc)

	var name *string
	if h1 := htmlutil.FindFirst(doc, func(n *html.Node) bool { return n.Data == "h1" }); h1 != nil {
		name = providers.StrIfNotEmpty(htmlutil.Text(h1))
	}
	if name == nil {
		if sn, ok := structured["name"].(string); ok {
			name = providers.StrIfNotEmpty(sn)
		}
	}

	stars, reviews := extractRating(doc, pageHTML, structured)
	details := domain.GameDetails{
		Name:         name,
		Description:  extractDescription(doc),
		ReleaseDate:  infoValue(doc, "Released"),
		ReviewsCount: reviews,
		StarsRate:    stars,
		Publisher:    extractPublisher(doc, structured),
		Regions:      extractRegions(doc),
		Icon:         extractIcon(doc, pageURL, structured),
		Screenshots:  extractScreenshots(doc, pageURL),
		Downloads:    nil,
	}
	return details, extractDownloadPageURL(doc, pageURL)
}

func parseDownloadOptions(pageHTML, pageURL string) []downloadOption {
	parsedPage, err := url.Parse(pageURL)
	if err != nil {
		return nil
	}
	postID := ""
	if m := trailingDigitsRe.FindStringSubmatch(strings.TrimRight(parsedPage.Path, "/")); len(m) == 2 {
		postID = m[1]
	} else if m := hiddenPostIDRe.FindStringSubmatch(pageHTML); len(m) == 2 {
		postID = m[1]
	}
	if postID == "" {
		return nil
	}

	doc, err := htmlutil.ParseHTML(pageHTML)
	if err != nil {
		return nil
	}

	basePrefix := strings.TrimRight(pageURL, "/") + "/"
	var options []downloadOption
	for _, a := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "a" }) {
		href, ok := htmlutil.Attr(a, "href")
		if !ok || href == "" {
			continue
		}
		optionURL := strings.TrimRight(htmlutil.SafeURLJoin(basePrefix, href), "/")
		parsedOpt, err := url.Parse(optionURL)
		if err != nil || parsedOpt.Hostname() != ProviderDomain {
			continue
		}
		idxMatch := optionIndexRe.FindStringSubmatch(parsedOpt.Path)
		if len(idxMatch) != 2 {
			continue
		}
		if !strings.HasPrefix(optionURL, basePrefix) {
			continue
		}
		options = append(options, downloadOption{
			Filename: textByClassMarker(a, "break-words"),
			Type:     textByClassMarker(a, "truncate"),
			Size:     textByClassMarker(a, "font-semibold shrink-0"),
			PageURL:  optionURL,
			PostID:   postID,
			Index:    idxMatch[1],
		})
	}
	return options
}

func fetchNonce(ctx context.Context, client ports.HTTPDoer, baseHeaders map[string]string, referer string) string {
	body, err := providers.DoPostForm(
		ctx,
		client,
		AjaxURL,
		nil,
		map[string]string{"action": "romspure_get_nonce"},
		providers.BuildHeaders(baseHeaders,
			"Accept", "application/json",
			"Origin", "https://romspure.cc",
			"Referer", referer,
			"X-Requested-With", "XMLHttpRequest",
		),
		ProviderLabel,
	)
	if err != nil {
		return ""
	}
	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			Nonce string `json:"nonce"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(body), &payload); err != nil || !payload.Success {
		return ""
	}
	return payload.Data.Nonce
}

func fetchDirectURL(ctx context.Context, client ports.HTTPDoer, baseHeaders map[string]string, opt downloadOption, nonce string) string {
	body, err := providers.DoPostForm(
		ctx,
		client,
		AjaxURL,
		nil,
		map[string]string{
			"action":  "app_get_download_link",
			"post_id": opt.PostID,
			"index":   opt.Index,
			"nonce":   nonce,
		},
		providers.BuildHeaders(baseHeaders,
			"Accept", "application/json",
			"Origin", "https://romspure.cc",
			"Referer", opt.PageURL,
			"X-Requested-With", "XMLHttpRequest",
		),
		ProviderLabel,
	)
	if err != nil {
		return ""
	}
	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(body), &payload); err != nil || !payload.Success {
		return ""
	}
	return payload.Data.URL
}

func collectDownloads(
	ctx context.Context,
	client ports.HTTPDoer,
	baseHeaders map[string]string,
	downloadsPageURL, gameURL string,
	onUpdate func([]domain.DownloadDetails),
) []domain.DownloadDetails {
	if !validateRomsPureURL(downloadsPageURL) {
		return nil
	}
	body, err := providers.DoGet(
		ctx,
		client,
		downloadsPageURL,
		nil,
		providers.BuildHeaders(baseHeaders, "Referer", gameURL),
		ProviderLabel,
	)
	if err != nil {
		return nil
	}
	options := parseDownloadOptions(body, downloadsPageURL)
	if len(options) == 0 {
		return nil
	}

	downloads := make([]domain.DownloadDetails, len(options))
	for i, opt := range options {
		downloads[i] = domain.DownloadDetails{
			Filename: opt.Filename,
			Type:     opt.Type,
			Size:     opt.Size,
		}
	}
	if onUpdate != nil {
		snap := make([]domain.DownloadDetails, len(downloads))
		copy(snap, downloads)
		onUpdate(snap)
	}

	nonce := fetchNonce(ctx, client, baseHeaders, options[0].PageURL)
	if nonce == "" {
		return downloads
	}

	var mu sync.Mutex
	providers.ResolveConcurrently(ctx, len(options), 4, func(i int) {
		directURL := providers.StrIfNotEmpty(fetchDirectURL(ctx, client, baseHeaders, options[i], nonce))
		if directURL == nil {
			return
		}
		mu.Lock()
		downloads[i].DownloadURL = directURL
		var snap []domain.DownloadDetails
		if onUpdate != nil {
			snap = make([]domain.DownloadDetails, len(downloads))
			copy(snap, downloads)
		}
		mu.Unlock()
		if onUpdate != nil {
			onUpdate(snap)
		}
	})
	return downloads
}
