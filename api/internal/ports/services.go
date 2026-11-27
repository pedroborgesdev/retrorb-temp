package ports

import (
	"context"
	"io"

	"retromancy/api/internal/domain"
)

// SearchService handles global and console-filtered catalog search.
type SearchService interface {
	Search(ctx context.Context, req domain.ConsoleQuery) (domain.SearchResponse, error)
}

// GameService retrieves and normalizes game metadata and download entries.
type GameService interface {
	GetDetails(ctx context.Context, source, gameURL string) (domain.GameResponse, error)
	StreamDetails(ctx context.Context, source, gameURL string, emit func(stage string, resp domain.GameResponse)) (domain.GameResponse, error)
}

// ConsoleService serves the validated definitive console catalog.
type ConsoleService interface {
	ListConsoles(ctx context.Context) (domain.ConsoleCatalog, error)
}

// DownloadService resolves a game's file index and opens a safe byte stream.
type DownloadService interface {
	OpenDownload(ctx context.Context, source, gameURL string, fileIndex int, expectedFilename *string, rangeHeader string) (domain.DownloadStream, error)
}

// AIService generates structured Markdown descriptions using Hugging Face.
type AIService interface {
	DescribeGame(ctx context.Context, req domain.DescribeRequest) (domain.DescribeResponse, error)
}

// RomCodeService decodes, resolves, and downloads ROMs referenced by compact RO1 codes.
type RomCodeService interface {
	Decode(code string) (domain.RomRef, error)
	Resolve(ctx context.Context, code string) (domain.ResolvedRomResponse, error)
	OpenDownload(ctx context.Context, code, rangeHeader string) (domain.DownloadStream, error)
}

// ImageProxyService validates and safely proxies cover artwork bytes for client-side color extraction.
type ImageProxyService interface {
	FetchImage(ctx context.Context, rawURL string) (io.ReadCloser, string, error)
}

// AIClient abstracts the upstream Hugging Face inference adapter.
type AIClient interface {
	GenerateDescription(ctx context.Context, apiKey string, model *string, title string, console *string, sourceDescription *string) (domain.DescribeResponse, error)
}
