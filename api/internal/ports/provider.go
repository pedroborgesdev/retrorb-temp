package ports

import (
	"context"

	"retromancy/api/internal/domain"
)

// Provider defines the contract every ROM source scraper must satisfy.
type Provider interface {
	ID() string
	Label() string
	Domain() string
	SearchBudgetSeconds() int
	RequestTimeoutSeconds() int
	RequestHeaders() map[string]string

	Search(ctx context.Context, query string, page int) (domain.SearchPage, error)
	Details(ctx context.Context, gameURL string) (domain.GameDetails, error)
	ParseSearchResults(htmlBody string) []domain.SearchResult
	HasNextPage(htmlBody string, currentPage int) bool
	EnrichConsoleResults(ctx context.Context, results []domain.SearchResult, hasMoreTime func() bool) []domain.SearchResult
}

// ProgressiveDetailsProvider can be implemented by providers that emit incremental
// game metadata and download options/links before all network hops complete.
type ProgressiveDetailsProvider interface {
	DetailsStream(ctx context.Context, gameURL string, emit func(domain.GameDetails)) (domain.GameDetails, error)
}

// CustomDownloadResolver can be implemented by providers (e.g. WowRoms) whose download
// resolution requires form submission or multi-step AJAX not represented in Details alone.
type CustomDownloadResolver interface {
	ResolveDownload(ctx context.Context, gameURL string, fileIndex int, expectedFilename *string) (domain.ProviderDownload, error)
}

// ProviderRegistry stores registered providers in a deterministic iteration order.
type ProviderRegistry interface {
	Get(id string) (Provider, bool)
	Keys() []string
	All() []Provider
}
