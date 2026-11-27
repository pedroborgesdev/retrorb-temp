package application

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/net/html"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/catalog"
	"retromancy/api/internal/infrastructure/htmlutil"
	"retromancy/api/internal/infrastructure/providers"
	"retromancy/api/internal/ports"
)

var providerDomains = map[string]string{
	"romsfun":   "romsfun.com",
	"romspure":  "romspure.cc",
	"romsgames": "www.romsgames.net",
	"wowroms":   "wowroms.com",
}

// SearchService coordinates parallel global and console-filtered game searches.
type SearchService struct {
	registry      ports.ProviderRegistry
	catalogRepo   ports.ConsoleCatalogRepository
	clientFactory providers.HTTPClientFactory
}

// NewSearchService constructs a SearchService with injected providers, catalog, and HTTP factory.
func NewSearchService(
	registry ports.ProviderRegistry,
	catalogRepo ports.ConsoleCatalogRepository,
	clientFactory providers.HTTPClientFactory,
) *SearchService {
	if clientFactory == nil {
		clientFactory = providers.DefaultClientFactory
	}
	return &SearchService{
		registry:      registry,
		catalogRepo:   catalogRepo,
		clientFactory: clientFactory,
	}
}

// Search executes either a console-filtered catalog search or an aggregate query search.
func (s *SearchService) Search(ctx context.Context, req domain.ConsoleQuery) (domain.SearchResponse, error) {
	query := strings.TrimSpace(req.Query)
	consoleName := strings.TrimSpace(req.ConsoleName)

	if (query == "" && consoleName == "") || utf8.RuneCountInString(query) > 200 {
		return domain.SearchResponse{}, domain.BadRequest("Informe uma pesquisa entre 1 e 200 caracteres.")
	}
	if req.Page < 1 || req.Page > 500 {
		return domain.SearchResponse{}, domain.BadRequest("A página deve estar entre 1 e 500.")
	}
	if req.Source != nil {
		if _, ok := s.registry.Get(*req.Source); !ok {
			return domain.SearchResponse{}, domain.BadRequest("Fonte inválida.")
		}
	}

	if consoleName != "" {
		return s.searchByConsole(ctx, query, consoleName, req.Source, req.Page)
	}

	var selected []ports.Provider
	if req.Source != nil {
		prov, _ := s.registry.Get(*req.Source)
		selected = []ports.Provider{prov}
	} else {
		selected = s.registry.All()
	}

	type providerOutcome struct {
		key    string
		result domain.SourceSearchResult
	}
	outcomes := make([]providerOutcome, len(selected))
	var wg sync.WaitGroup
	for i, prov := range selected {
		wg.Add(1)
		go func(idx int, provider ports.Provider) {
			defer wg.Done()
			outcomes[idx] = providerOutcome{
				key:    provider.ID(),
				result: searchSingleProvider(ctx, provider, query, req.Page),
			}
		}(i, prov)
	}
	wg.Wait()

	sources := make(map[string]domain.SourceSearchResult, len(outcomes))
	for _, out := range outcomes {
		sources[out.key] = out.result
	}

	return domain.SearchResponse{
		Query:   query,
		Sources: sources,
	}, nil
}

func searchSingleProvider(ctx context.Context, provider ports.Provider, query string, page int) domain.SourceSearchResult {
	res, err := provider.Search(ctx, query, page)
	if err != nil {
		errMsg := fmt.Sprintf("Não foi possível consultar %s. Tente novamente.", provider.Label())
		return domain.SourceSearchResult{
			Label:      provider.Label(),
			Results:    []domain.SearchResult{},
			Error:      &errMsg,
			Pagination: domain.Pagination{Page: page, HasNext: false},
		}
	}
	results := res.Results
	if results == nil {
		results = []domain.SearchResult{}
	}
	return domain.SourceSearchResult{
		Label:      provider.Label(),
		Results:    results,
		Error:      nil,
		Pagination: domain.Pagination{Page: res.Page, HasNext: res.HasNext},
	}
}

func (s *SearchService) searchByConsole(
	ctx context.Context,
	query, consoleName string,
	sourceFilter *string,
	page int,
) (domain.SearchResponse, error) {
	consoleEntry, err := s.catalogRepo.ResolveConsole(consoleName)
	if err != nil {
		return domain.SearchResponse{}, err
	}

	mappings := consoleEntry.Providers
	if sourceFilter != nil {
		filtered := make([]domain.ConsoleProvider, 0, len(mappings))
		for _, m := range mappings {
			if m.Name == *sourceFilter {
				filtered = append(filtered, m)
			}
		}
		mappings = filtered
	}

	type consoleOutcome struct {
		mapping domain.ConsoleProvider
		results []domain.SearchResult
		hasNext bool
		errMsg  *string
	}

	outcomes := make([]consoleOutcome, len(mappings))
	var wg sync.WaitGroup
	for i, mapping := range mappings {
		wg.Add(1)
		go func(idx int, m domain.ConsoleProvider) {
			defer wg.Done()
			results, hasNext, errMsg := s.fetchConsoleProvider(ctx, m, page, query)
			outcomes[idx] = consoleOutcome{
				mapping: m,
				results: results,
				hasNext: hasNext,
				errMsg:  errMsg,
			}
		}(i, mapping)
	}
	wg.Wait()

	acceptedAliases := make(map[string]struct{}, len(consoleEntry.CorrelativeNames)+1)
	acceptedAliases[catalog.NormalizeName(consoleEntry.Name)] = struct{}{}
	for _, alias := range consoleEntry.CorrelativeNames {
		acceptedAliases[catalog.NormalizeName(alias)] = struct{}{}
	}

	sources := make(map[string]domain.SourceSearchResult, len(outcomes))
	for _, out := range outcomes {
		prov, ok := s.registry.Get(out.mapping.Name)
		label := out.mapping.Name
		if ok {
			label = prov.Label()
		}

		existing, seen := sources[out.mapping.Name]
		if !seen {
			existing = domain.SourceSearchResult{
				Label:      label,
				Results:    []domain.SearchResult{},
				Error:      nil,
				Pagination: domain.Pagination{Page: page, HasNext: false},
			}
		}

		filteredResults := filterResultsByConsole(out.results, acceptedAliases)
		existing.Results = append(existing.Results, filteredResults...)
		if existing.Error == nil && out.errMsg != nil {
			existing.Error = out.errMsg
		}
		existing.Pagination.HasNext = existing.Pagination.HasNext || out.hasNext
		sources[out.mapping.Name] = existing
	}

	return domain.SearchResponse{
		Query:   query,
		Console: &consoleEntry.Name,
		Sources: sources,
	}, nil
}

func (s *SearchService) fetchConsoleProvider(
	ctx context.Context,
	mapping domain.ConsoleProvider,
	page int,
	query string,
) ([]domain.SearchResult, bool, *string) {
	prov, ok := s.registry.Get(mapping.Name)
	if !ok {
		msg := fmt.Sprintf("Não foi possível consultar %s.", mapping.Name)
		return nil, false, &msg
	}

	prepared, err := catalog.PrepareProviderRequest(mapping, page, query)
	if err != nil {
		msg := fmt.Sprintf("Não foi possível consultar %s.", mapping.Name)
		return nil, false, &msg
	}
	if prepared.UnpaginatedSearch && page > 1 {
		return []domain.SearchResult{}, false, nil
	}

	_, hasMoreTime := providers.BudgetDeadline(prov.SearchBudgetSeconds())
	client := s.clientFactory(time.Duration(prov.RequestTimeoutSeconds()) * time.Second)
	body, err := providers.DoGet(ctx, client, prepared.URL, prepared.Params, prov.RequestHeaders(), prov.Label())
	if err != nil {
		msg := fmt.Sprintf("Não foi possível consultar %s.", mapping.Name)
		return nil, false, &msg
	}

	results := prov.ParseSearchResults(body)
	results = sanitizeConsoleResultURLs(results, mapping.Name)
	restoreConsoleFromURLs(results, mapping)
	if mapping.Name == "romsgames" {
		preFiltered := make([]domain.SearchResult, 0, len(results))
		for _, r := range results {
			if matchesConsoleURL(r, mapping) {
				preFiltered = append(preFiltered, r)
			}
		}
		results = preFiltered
	}

	results = prov.EnrichConsoleResults(ctx, results, hasMoreTime)
	if mapping.Name == "romsgames" {
		restoreConsoleFromURLs(results, mapping)
	}

	var hasNext bool
	if prepared.UnpaginatedSearch {
		hasNext = false
	} else if prepared.PaginationMode == "path" {
		hasNext = prov.HasNextPage(body, page)
	} else {
		hasNext = hasNextQueryPage(body, prepared.URL, page, prepared.PageParam)
	}

	return results, hasNext, nil
}

func sanitizeConsoleResultURLs(results []domain.SearchResult, providerName string) []domain.SearchResult {
	expectedHost := providerDomains[providerName]
	safe := make([]domain.SearchResult, 0, len(results))
	for _, r := range results {
		if r.URL == nil {
			continue
		}
		if providers.SanitizeResultURL(*r.URL, expectedHost, providerName) {
			safe = append(safe, r)
		}
	}
	return safe
}

func matchesConsoleURL(result domain.SearchResult, mapping domain.ConsoleProvider) bool {
	if result.URL == nil {
		return false
	}
	categoryParsed, err := url.Parse(mapping.Consult.URL)
	if err != nil {
		return false
	}
	gameParsed, err := url.Parse(*result.URL)
	if err != nil {
		return false
	}
	catPath, _ := url.PathUnescape(categoryParsed.Path)
	gamePath, _ := url.PathUnescape(gameParsed.Path)
	catSegments := strings.Split(strings.Trim(catPath, "/"), "/")
	if len(catSegments) == 0 {
		return false
	}
	consoleSlug := strings.ToLower(strings.ReplaceAll(catSegments[len(catSegments)-1], "+", "-"))
	lowerGamePath := strings.ToLower(strings.Trim(gamePath, "/"))

	switch mapping.Name {
	case "romsgames":
		return strings.HasPrefix(lowerGamePath, consoleSlug+"-rom-")
	case "wowroms":
		return strings.HasPrefix(lowerGamePath, "en/roms/"+consoleSlug+"/")
	default:
		return false
	}
}

func restoreConsoleFromURLs(results []domain.SearchResult, mapping domain.ConsoleProvider) {
	for i := range results {
		if (results[i].Console == nil || strings.TrimSpace(*results[i].Console) == "") && matchesConsoleURL(results[i], mapping) {
			cn := mapping.ConsoleName
			results[i].Console = &cn
		}
	}
}

func filterResultsByConsole(results []domain.SearchResult, accepted map[string]struct{}) []domain.SearchResult {
	filtered := make([]domain.SearchResult, 0, len(results))
	for _, r := range results {
		if r.Console == nil {
			continue
		}
		if _, ok := accepted[catalog.NormalizeName(*r.Console)]; ok {
			filtered = append(filtered, r)
		}
	}
	return filtered
}

func hasNextQueryPage(pageHTML, currentURL string, currentPage int, pageParam string) bool {
	base, err := url.Parse(currentURL)
	if err != nil {
		return false
	}
	doc, err := htmlutil.ParseHTML(pageHTML)
	if err != nil {
		return false
	}
	expectedPage := fmt.Sprintf("%d", currentPage+1)
	basePath := strings.TrimRight(base.Path, "/")
	for _, a := range htmlutil.FindAll(doc, func(n *html.Node) bool { return n.Data == "a" }) {
		href, ok := htmlutil.Attr(a, "href")
		if !ok || href == "" {
			continue
		}
		joined := htmlutil.SafeURLJoin(currentURL, href)
		if joined == "" {
			continue
		}
		cand, err := url.Parse(joined)
		if err != nil {
			continue
		}
		if cand.Scheme == "https" &&
			cand.Hostname() == base.Hostname() &&
			strings.TrimRight(cand.Path, "/") == basePath &&
			cand.Query().Get(pageParam) == expectedPage {
			return true
		}
	}
	return false
}
