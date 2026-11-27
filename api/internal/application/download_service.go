package application

import (
	"context"
	"errors"
	"fmt"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/htmlutil"
	"retromancy/api/internal/infrastructure/netsec"
	"retromancy/api/internal/ports"
)

// DownloadService resolves file download targets and opens safe pinned streams.
type DownloadService struct {
	registry ports.ProviderRegistry
	opener   ports.DownloadOpener
}

// NewDownloadService constructs a DownloadService with injected registry and downloader.
func NewDownloadService(registry ports.ProviderRegistry, opener ports.DownloadOpener) *DownloadService {
	return &DownloadService{
		registry: registry,
		opener:   opener,
	}
}

// OpenDownload validates parameters, resolves the provider file, and opens a DNS-pinned remote stream.
func (s *DownloadService) OpenDownload(
	ctx context.Context,
	source, gameURL string,
	fileIndex int,
	expectedFilename *string,
	rangeHeader string,
) (domain.DownloadStream, error) {
	prov, ok := s.registry.Get(source)
	if !ok {
		return domain.DownloadStream{}, domain.BadRequest("Fonte inválida.")
	}
	if !htmlutil.ValidateGameURL(gameURL, prov.Domain()) {
		return domain.DownloadStream{}, domain.BadRequest("URL inválida para esta fonte.")
	}
	if fileIndex < 0 {
		return domain.DownloadStream{}, domain.BadRequest("Arquivo inválido.")
	}
	rangeStart, err := netsec.ParseRangeStart(rangeHeader)
	if err != nil {
		return domain.DownloadStream{}, err
	}

	selected, err := s.selectProviderDownload(ctx, prov, gameURL, fileIndex, expectedFilename)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			return domain.DownloadStream{}, err
		}
		return domain.DownloadStream{}, domain.BadGateway(
			fmt.Sprintf("Não foi possível preparar este download em %s.", prov.Label()),
			err,
		)
	}

	referer := selected.Referer
	if referer == "" {
		referer = gameURL
	}
	body, status, headers, err := s.opener.OpenPinned(ctx, selected.URL, ports.OpenPinnedOptions{
		Referer:    referer,
		Method:     selected.Method,
		FormData:   selected.FormData,
		RangeStart: rangeStart,
		UserAgent:  netsec.BrowserUserAgent,
	})
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			return domain.DownloadStream{}, err
		}
		return domain.DownloadStream{}, domain.BadGateway(
			fmt.Sprintf("Não foi possível preparar este download em %s.", prov.Label()),
			err,
		)
	}

	return domain.DownloadStream{
		Filename: selected.Filename,
		Status:   status,
		Headers:  headers,
		Body:     body,
	}, nil
}

func (s *DownloadService) selectProviderDownload(
	ctx context.Context,
	prov ports.Provider,
	gameURL string,
	fileIndex int,
	expectedFilename *string,
) (domain.ProviderDownload, error) {
	if custom, ok := prov.(ports.CustomDownloadResolver); ok {
		return custom.ResolveDownload(ctx, gameURL, fileIndex, expectedFilename)
	}

	details, err := prov.Details(ctx, gameURL)
	if err != nil {
		return domain.ProviderDownload{}, err
	}
	if fileIndex < 0 || fileIndex >= len(details.Downloads) {
		return domain.ProviderDownload{}, domain.NotFound("Arquivo indisponível.")
	}
	raw := details.Downloads[fileIndex]
	if raw.DownloadURL == nil {
		return domain.ProviderDownload{}, domain.NotFound("Arquivo indisponível.")
	}
	normalizedURL, err := netsec.NormalizeDownloadURL(*raw.DownloadURL)
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

	return domain.ProviderDownload{
		URL:       normalizedURL,
		Filename:  filename,
		MediaType: raw.Type,
		Size:      raw.Size,
		Method:    "GET",
	}, nil
}
