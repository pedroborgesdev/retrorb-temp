package domain

// SearchResult is the normalized game search item shared by all providers and endpoints.
// Nullable fields omit omitempty so JSON explicitly emits null.
type SearchResult struct {
	Title     *string `json:"title"`
	URL       *string `json:"url"`
	Icon      *string `json:"icon"`
	Console   *string `json:"console"`
	Size      *string `json:"size"`
	Downloads *int    `json:"downloads"`
}

// SearchPage is a single paginated search result returned by a provider.
type SearchPage struct {
	Results []SearchResult
	Page    int
	HasNext bool
}

// Pagination holds pagination metadata in a source search payload.
type Pagination struct {
	Page    int  `json:"page"`
	HasNext bool `json:"has_next"`
}

// SourceSearchResult represents one provider's slice inside GET /api/search.
type SourceSearchResult struct {
	Label      string         `json:"label"`
	Results    []SearchResult `json:"results"`
	Error      *string        `json:"error"`
	Pagination Pagination     `json:"pagination"`
}

// SearchResponse is the top-level JSON response of GET /api/search.
type SearchResponse struct {
	Query   string                        `json:"query"`
	Console *string                       `json:"console,omitempty"`
	Sources map[string]SourceSearchResult `json:"sources"`
}

// PaginationConfig defines how a catalog provider paginates console listings.
type PaginationConfig struct {
	Mode        string `json:"mode"`
	URLTemplate string `json:"url_template,omitempty"`
	PageParam   string `json:"page_param,omitempty"`
}

// SearchConfig defines optional title filtering parameters for a catalog provider.
type SearchConfig struct {
	Param     string `json:"param"`
	URL       string `json:"url,omitempty"`
	Paginated *bool  `json:"paginated,omitempty"`
}

// ConsultConfig describes the HTTP GET blueprint for querying a provider console page.
type ConsultConfig struct {
	Method     string            `json:"method"`
	URL        string            `json:"url"`
	Params     map[string]string `json:"params"`
	Pagination PaginationConfig  `json:"pagination"`
	Search     *SearchConfig     `json:"search,omitempty"`
}

// ConsoleProvider maps one provider to a canonical console in the definitive catalog.
type ConsoleProvider struct {
	Name        string        `json:"name"`
	ConsoleName string        `json:"console_name"`
	Consult     ConsultConfig `json:"consult"`
}

// ConsoleEntry describes one platform in contexto/consoles-definitive.json.
type ConsoleEntry struct {
	Name             string            `json:"name"`
	Image            *string           `json:"image"`
	CorrelativeNames []string          `json:"correlative_names"`
	Providers        []ConsoleProvider `json:"providers"`
}

// ConsoleCatalog is the top-level payload returned by GET /api/consoles.
type ConsoleCatalog struct {
	Consoles []ConsoleEntry `json:"consoles"`
}

// ConsoleQuery is the domain request for searching games by query and/or console.
type ConsoleQuery struct {
	Query       string
	ConsoleName string
	Source      *string
	Page        int
}
