package catalog

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"

	"retromancy/api/internal/domain"
)

var allowedProviders = map[string]string{
	"romsfun":   "romsfun.com",
	"romspure":  "romspure.cc",
	"romsgames": "www.romsgames.net",
	"wowroms":   "wowroms.com",
}

// FileRepository loads, strictly validates, and queries consoles-definitive.json.
type FileRepository struct {
	path string
}

// NewFileRepository creates a repository backed by the given JSON file path.
func NewFileRepository(path string) *FileRepository {
	return &FileRepository{path: path}
}

// Load reads and validates the definitive console catalog from disk.
func (r *FileRepository) Load() (domain.ConsoleCatalog, error) {
	raw, err := os.ReadFile(r.path)
	if err != nil {
		return domain.ConsoleCatalog{}, domain.ServiceUnavailable("Não foi possível carregar o catálogo de consoles.", err)
	}
	return ParseAndValidateCatalog(raw)
}

// ResolveConsole locates a unique console entry matching canonical or correlative names.
func (r *FileRepository) ResolveConsole(name string) (domain.ConsoleEntry, error) {
	if strings.TrimSpace(name) == "" {
		return domain.ConsoleEntry{}, domain.BadRequest("Informe o nome do console.")
	}
	catalog, err := r.Load()
	if err != nil {
		return domain.ConsoleEntry{}, err
	}
	searched := NormalizeName(name)
	matches := make([]domain.ConsoleEntry, 0, 1)
	for _, entry := range catalog.Consoles {
		if MatchesAnyName(entry, searched) {
			matches = append(matches, entry)
		}
	}
	if len(matches) == 0 {
		return domain.ConsoleEntry{}, domain.BadRequest(fmt.Sprintf("Console não encontrado: %q.", strings.TrimSpace(name)))
	}
	if len(matches) > 1 {
		return domain.ConsoleEntry{}, domain.BadRequest(fmt.Sprintf("Nome de console ambíguo: %q.", strings.TrimSpace(name)))
	}
	return matches[0], nil
}

// ParseAndValidateCatalog validates JSON structure strictly against the catalog schema.
func ParseAndValidateCatalog(raw []byte) (domain.ConsoleCatalog, error) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil || len(top) != 1 {
		return domain.ConsoleCatalog{}, domain.ServiceUnavailable("O catálogo de consoles possui estrutura inválida.", err)
	}
	if _, ok := top["consoles"]; !ok {
		return domain.ConsoleCatalog{}, domain.ServiceUnavailable("O catálogo de consoles possui estrutura inválida.", nil)
	}

	var catalog domain.ConsoleCatalog
	if err := json.Unmarshal(raw, &catalog); err != nil || catalog.Consoles == nil {
		return domain.ConsoleCatalog{}, domain.ServiceUnavailable("O catálogo de consoles possui estrutura inválida.", err)
	}

	for _, entry := range catalog.Consoles {
		if strings.TrimSpace(entry.Name) == "" || len(entry.CorrelativeNames) == 0 || entry.Providers == nil {
			return domain.ConsoleCatalog{}, domain.ServiceUnavailable("Um console do catálogo possui valores inválidos.", nil)
		}
		for _, alias := range entry.CorrelativeNames {
			if strings.TrimSpace(alias) == "" {
				return domain.ConsoleCatalog{}, domain.ServiceUnavailable("Um console do catálogo possui valores inválidos.", nil)
			}
		}
		for _, prov := range entry.Providers {
			if err := validateProvider(prov); err != nil {
				return domain.ConsoleCatalog{}, err
			}
		}
	}
	return catalog, nil
}

func validateProvider(prov domain.ConsoleProvider) error {
	if _, ok := allowedProviders[prov.Name]; !ok {
		return domain.ServiceUnavailable("Provedor desconhecido no catálogo.", nil)
	}
	if strings.TrimSpace(prov.ConsoleName) == "" {
		return domain.ServiceUnavailable("Um provedor do catálogo possui valores inválidos.", nil)
	}
	_, err := PrepareProviderRequest(prov, 1, "")
	return err
}

// PreparedRequest describes an expanded URL and query parameters for a catalog provider fetch.
type PreparedRequest struct {
	URL               string
	Params            map[string]string
	UnpaginatedSearch bool
	PageParam         string
	PaginationMode    string
}

// PrepareProviderRequest computes the concrete request URL and params for a page and optional query.
func PrepareProviderRequest(prov domain.ConsoleProvider, page int, query string) (PreparedRequest, error) {
	if page < 1 {
		return PreparedRequest{}, domain.BadRequest("A página deve ser um inteiro positivo.")
	}
	expectedHost, ok := allowedProviders[prov.Name]
	if !ok {
		return PreparedRequest{}, domain.ServiceUnavailable("Provedor desconhecido no catálogo.", nil)
	}
	if prov.Consult.Method != "GET" {
		return PreparedRequest{}, domain.ServiceUnavailable("A consulta do provedor é inválida.", nil)
	}
	if !isValidCatalogURL(prov.Consult.URL, expectedHost) {
		return PreparedRequest{}, domain.ServiceUnavailable(fmt.Sprintf("A URL de consulta do %s é inválida.", prov.Name), nil)
	}
	if prov.Consult.Params == nil {
		return PreparedRequest{}, domain.ServiceUnavailable("Os parâmetros de consulta são inválidos.", nil)
	}

	targetURL := prov.Consult.URL
	params := make(map[string]string, len(prov.Consult.Params)+2)
	for k, v := range prov.Consult.Params {
		params[k] = v
	}

	mode := prov.Consult.Pagination.Mode
	switch mode {
	case "path":
		tmpl := prov.Consult.Pagination.URLTemplate
		if !isValidCatalogURL(tmpl, expectedHost) || !strings.Contains(tmpl, "{page}") {
			return PreparedRequest{}, domain.ServiceUnavailable("O modelo de paginação é inválido.", nil)
		}
		if page > 1 {
			targetURL = strings.ReplaceAll(tmpl, "{page}", fmt.Sprintf("%d", page))
		}
	case "query":
		pageParam := prov.Consult.Pagination.PageParam
		if pageParam == "" {
			return PreparedRequest{}, domain.ServiceUnavailable("O parâmetro de paginação é inválido.", nil)
		}
		if page > 1 {
			params[pageParam] = fmt.Sprintf("%d", page)
		}
	default:
		return PreparedRequest{}, domain.ServiceUnavailable("O modo de paginação é inválido.", nil)
	}

	var unpaginatedSearch bool
	if prov.Consult.Search != nil {
		if prov.Consult.Search.Param != "q" && prov.Consult.Search.Param != "search" {
			return PreparedRequest{}, domain.ServiceUnavailable("A configuração de busca do provedor é inválida.", nil)
		}
		if prov.Consult.Search.URL != "" && !isValidCatalogURL(prov.Consult.Search.URL, expectedHost) {
			return PreparedRequest{}, domain.ServiceUnavailable(fmt.Sprintf("A URL de consulta do %s é inválida.", prov.Name), nil)
		}
		if prov.Consult.Search.Paginated != nil && !*prov.Consult.Search.Paginated {
			unpaginatedSearch = query != ""
		}
	}

	if query != "" {
		if prov.Consult.Search == nil {
			return PreparedRequest{}, domain.ServiceUnavailable("O provedor não possui configuração de busca por título.", nil)
		}
		if prov.Consult.Search.URL != "" {
			targetURL = prov.Consult.Search.URL
			params = make(map[string]string, 1)
		}
		params[prov.Consult.Search.Param] = query
	}

	return PreparedRequest{
		URL:               targetURL,
		Params:            params,
		UnpaginatedSearch: unpaginatedSearch,
		PageParam:         prov.Consult.Pagination.PageParam,
		PaginationMode:    mode,
	}, nil
}

func isValidCatalogURL(raw, expectedHost string) bool {
	if raw == "" {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return parsed.Scheme == "https" &&
		parsed.Hostname() == expectedHost &&
		parsed.User == nil &&
		parsed.Port() == ""
}

// NormalizeName collapses whitespace runs and folds case for alias comparisons.
func NormalizeName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}

// MatchesAnyName reports whether normalizedName matches the console's canonical name or any alias.
func MatchesAnyName(entry domain.ConsoleEntry, normalizedTarget string) bool {
	if NormalizeName(entry.Name) == normalizedTarget {
		return true
	}
	for _, alias := range entry.CorrelativeNames {
		if NormalizeName(alias) == normalizedTarget {
			return true
		}
	}
	return false
}
