package romsgames

import (
	"context"
	"encoding/json"
	"fmt"
	stdhtml "html"
	"math"
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
)

const (
	BaseURL        = "https://www.romsgames.net/"
	SearchURL      = "https://www.romsgames.net/search/"
	ProviderID     = "romsgames"
	ProviderLabel  = "RomsGames"
	ProviderDomain = "romsgames.net"
	ProviderHost   = "www.romsgames.net"
	TimeoutSeconds = 15
	BudgetSeconds  = 18
)

var mediaIDRe = regexp.MustCompile(`(?i)data-media-id=["'](\d+)["']`)

// Provider implements ports.Provider for RomsGames.
type Provider struct {
	clientFactory providers.HTTPClientFactory
	headers       map[string]string
}

// NewProvider builds a RomsGames scraper using the injected HTTP client factory.
func NewProvider(factory providers.HTTPClientFactory) *Provider {
	if factory == nil {
		factory = providers.DefaultClientFactory
	}
	return &Provider{
		clientFactory: factory,
		headers: map[string]string{
			"Accept":     "text/html,application/xhtml+xml",
			"Referer":    BaseURL,
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
	if page > 1 {
		return domain.SearchPage{
			Results: []domain.SearchResult{},
			Page:    page,
			HasNext: false,
		}, nil
	}

	client := p.clientFactory(time.Duration(TimeoutSeconds) * time.Second)
	body, err := providers.DoGet(
		ctx,
		client,
		SearchURL,
		map[string]string{"q": normalized},
		p.headers,
		ProviderLabel,
	)
	if err != nil {
		return domain.SearchPage{}, fmt.Errorf("não foi possível pesquisar no RomsGames: %w", err)
	}

	_, hasMoreTime := providers.BudgetDeadline(BudgetSeconds)
	results := p.ParseSearchResults(body)
	results = p.EnrichConsoleResults(ctx, results, hasMoreTime)

	return domain.SearchPage{
		Results: results,
		Page:    page,
		HasNext: false,
	}, nil
}

func (p *Provider) ParseSearchResults(pageHTML string) []domain.SearchResult {
	doc, err := htmlutil.ParseHTML(pageHTML)
	if err != nil {
		return []domain.SearchResult{}
	}
	anchors := htmlutil.FindAll(doc, func(n *html.Node) bool {
		return n.Data == "a" && htmlutil.HasClass(n, "shadow-lg")
	})

	results := make([]domain.SearchResult, 0, len(anchors))
	for _, a := range anchors {
		href, ok := htmlutil.Attr(a, "href")
		if !ok || href == "" {
			continue
		}
		gameURL := htmlutil.SafeURLJoin(BaseURL, href)
		parsed, err := url.Parse(gameURL)
		if err != nil || parsed.Scheme != "https" || parsed.Hostname() != ProviderHost {
			continue
		}

		var title string
		var src string
		if img := htmlutil.FindFirst(a, func(n *html.Node) bool { return n.Data == "img" }); img != nil {
			title, _ = htmlutil.Attr(img, "alt")
			src, _ = htmlutil.Attr(img, "src")
		}
		if title == "" {
			if titleNode := htmlutil.FindFirst(a, func(n *html.Node) bool {
				return n.Data == "div" && htmlutil.HasClass(n, "text-gray-900")
			}); titleNode != nil {
				title = htmlutil.Text(titleNode)
			}
		}

		var icon *string
		if src != "" {
			joined := htmlutil.SafeURLJoin(gameURL, src)
			if joined != "" && !strings.Contains(joined, "/image/no-cover.") {
				icon = &joined
			}
		}

		results = append(results, domain.SearchResult{
			Title:     providers.StrIfNotEmpty(title),
			URL:       &gameURL,
			Icon:      icon,
			Console:   nil,
			Size:      nil,
			Downloads: nil,
		})
	}
	return results
}

func (p *Provider) HasNextPage(_ string, _ int) bool {
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
		doc, err := htmlutil.ParseHTML(body)
		if err != nil {
			continue
		}
		structured := htmlutil.ExtractJSONLDVideoGame(doc)
		if console, ok := structured["gamePlatform"].(string); ok {
			results[i].Console = providers.StrIfNotEmpty(console)
		}
		if size, ok := structured["fileSize"].(string); ok {
			results[i].Size = providers.StrIfNotEmpty(size)
		}
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
	if !validateRomsGamesURL(gameURL) {
		return domain.GameDetails{}, domain.BadRequest("A URL deve usar HTTPS e pertencer a www.romsgames.net.")
	}
	normalizedURL := strings.TrimRight(gameURL, "/") + "/"
	client := p.clientFactory(time.Duration(TimeoutSeconds) * time.Second)
	pageHTML, err := providers.DoGet(ctx, client, normalizedURL, nil, p.headers, ProviderLabel)
	if err != nil {
		return domain.GameDetails{}, fmt.Errorf("não foi possível abrir a página do jogo no RomsGames: %w", err)
	}

	details, mediaIDs := parseGamePage(pageHTML, normalizedURL)
	if emit != nil {
		emit(providers.CloneGameDetails(details))
	}
	if len(mediaIDs) > 0 {
		downloads := make([]domain.DownloadDetails, len(mediaIDs))
		resolved := make([]bool, len(mediaIDs))
		postHeaders := providers.BuildHeaders(
			p.headers,
			"Accept", "application/json",
			"Origin", "https://www.romsgames.net",
			"Referer", normalizedURL,
			"X-Requested-With", "XMLHttpRequest",
		)
		var mu sync.Mutex
		providers.ResolveConcurrently(ctx, len(mediaIDs), 4, func(i int) {
			body, err := providers.DoPostForm(
				ctx,
				client,
				normalizedURL+"?download",
				nil,
				map[string]string{"mediaId": mediaIDs[i]},
				postHeaders,
				ProviderLabel,
			)
			var dl domain.DownloadDetails
			if err == nil {
				dl = downloadFromPayload(body)
			}
			mu.Lock()
			downloads[i] = dl
			resolved[i] = true
			var snap domain.GameDetails
			hasPartial := false
			if emit != nil {
				partial := make([]domain.DownloadDetails, 0, len(mediaIDs))
				for j := range downloads {
					if resolved[j] && (downloads[j].Filename != nil || downloads[j].DownloadURL != nil) {
						partial = append(partial, downloads[j])
					}
				}
				if len(partial) > 0 {
					snap = providers.CloneGameDetails(details)
					snap.Downloads = partial
					hasPartial = true
				}
			}
			mu.Unlock()
			if hasPartial {
				emit(snap)
			}
		})
		details.Downloads = downloads
	}
	return details, nil
}

func validateRomsGamesURL(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Hostname() == ProviderHost
}

func parseGamePage(pageHTML, pageURL string) (domain.GameDetails, []string) {
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

	stars, reviews := extractRating(structured)
	var desc *string
	if rawDesc, ok := structured["description"].(string); ok && rawDesc != "" {
		desc = providers.StrIfNotEmpty(stdhtml.UnescapeString(rawDesc))
	}

	var icon *string
	if rawImg, ok := structured["image"].(string); ok && rawImg != "" {
		icon = providers.StrIfNotEmpty(htmlutil.SafeURLJoin(pageURL, rawImg))
	}

	details := domain.GameDetails{
		Name:         name,
		Description:  desc,
		ReleaseDate:  nil,
		ReviewsCount: reviews,
		StarsRate:    stars,
		Publisher:    extractPublisher(structured),
		Regions:      extractRegions(doc),
		Icon:         icon,
		Screenshots:  extractScreenshots(structured, pageURL),
		Downloads:    nil,
	}
	return details, extractMediaIDs(pageHTML)
}

func extractRating(structured map[string]any) (*float64, *int) {
	agg, ok := structured["aggregateRating"].(map[string]any)
	if !ok {
		return nil, nil
	}
	var stars *float64
	switch v := agg["ratingValue"].(type) {
	case float64:
		stars = &v
	case string:
		if parsed, err := strconv.ParseFloat(v, 64); err == nil {
			stars = &parsed
		}
	}
	var count *int
	switch v := agg["ratingCount"].(type) {
	case float64:
		c := int(v)
		count = &c
	case string:
		if parsed, err := strconv.Atoi(strings.ReplaceAll(v, ",", "")); err == nil {
			count = &parsed
		}
	}
	return stars, count
}

func extractPublisher(structured map[string]any) *string {
	switch pub := structured["publisher"].(type) {
	case string:
		return providers.StrIfNotEmpty(pub)
	case map[string]any:
		if name, ok := pub["name"].(string); ok {
			return providers.StrIfNotEmpty(name)
		}
	case []any:
		for _, item := range pub {
			if obj, ok := item.(map[string]any); ok {
				if name, ok := obj["name"].(string); ok {
					return providers.StrIfNotEmpty(name)
				}
			}
		}
	}
	return nil
}

func extractRegions(doc *html.Node) []string {
	for _, div := range htmlutil.FindAll(doc, func(n *html.Node) bool {
		return n.Data == "div" && htmlutil.HasClass(n, "mb-4")
	}) {
		img := htmlutil.FindFirst(div, func(n *html.Node) bool { return n.Data == "img" })
		if img == nil {
			continue
		}
		src, _ := htmlutil.Attr(img, "src")
		if !strings.Contains(src, "-flag.") {
			continue
		}
		if val := htmlutil.Text(div); val != "" {
			return []string{val}
		}
	}
	return nil
}

func extractScreenshots(structured map[string]any, pageURL string) []string {
	raw, ok := structured["screenshot"]
	if !ok {
		return nil
	}
	seen := make(map[string]struct{})
	var out []string
	add := func(item any) {
		if s, ok := item.(string); ok && s != "" {
			joined := htmlutil.SafeURLJoin(pageURL, s)
			if joined != "" {
				if _, dup := seen[joined]; !dup {
					seen[joined] = struct{}{}
					out = append(out, joined)
				}
			}
		}
	}
	switch typed := raw.(type) {
	case []any:
		for _, item := range typed {
			add(item)
		}
	default:
		add(typed)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func extractMediaIDs(pageHTML string) []string {
	seen := make(map[string]struct{})
	var ids []string
	for _, m := range mediaIDRe.FindAllStringSubmatch(pageHTML, -1) {
		if _, dup := seen[m[1]]; !dup {
			seen[m[1]] = struct{}{}
			ids = append(ids, m[1])
		}
	}
	return ids
}

func formatSize(value any) *string {
	switch typed := value.(type) {
	case string:
		return providers.StrIfNotEmpty(typed)
	case float64:
		if typed < 0 || math.IsNaN(typed) {
			return nil
		}
		units := []string{"B", "KB", "MB", "GB", "TB"}
		size := typed
		idx := 0
		for size >= 1000 && idx < len(units)-1 {
			size /= 1000
			idx++
		}
		if idx == 0 {
			formatted := fmt.Sprintf("%d B", int(size))
			return &formatted
		}
		num := strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", size), "0"), ".")
		formatted := fmt.Sprintf("%s %s", num, units[idx])
		return &formatted
	default:
		return nil
	}
}

func downloadFromPayload(rawBody string) domain.DownloadDetails {
	var payload map[string]any
	if err := json.Unmarshal([]byte(rawBody), &payload); err != nil {
		return domain.DownloadDetails{}
	}
	media, _ := payload["media"].(map[string]any)

	var filename *string
	if encodedName, ok := payload["downloadName"].(string); ok && encodedName != "" {
		if decoded, err := url.PathUnescape(encodedName); err == nil {
			filename = providers.StrIfNotEmpty(decoded)
		} else {
			filename = providers.StrIfNotEmpty(encodedName)
		}
	} else if mediaName, ok := media["name"].(string); ok {
		filename = providers.StrIfNotEmpty(mediaName)
	}

	var mediaType *string
	if resources, ok := media["MediaResources"].([]any); ok {
		for _, res := range resources {
			obj, ok := res.(map[string]any)
			if !ok {
				continue
			}
			if mime, ok := obj["mimeType"].(string); ok && mime != "" {
				mediaType = &mime
				break
			}
		}
	}
	if mediaType == nil {
		if t, ok := media["type"].(string); ok && t != "" {
			mediaType = &t
		}
	}

	var directURL *string
	if dl, ok := payload["downloadUrl"].(string); ok && dl != "" {
		directURL = &dl
	}

	return domain.DownloadDetails{
		Filename:    filename,
		Type:        mediaType,
		Size:        formatSize(media["size"]),
		DownloadURL: directURL,
	}
}
