package application

import (
	"context"
	"io"
	"net/http"
	"strings"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/netsec"
	"retromancy/api/internal/ports"
)

const maxProxiedImageBytes = 5 << 20 // 5 MB

// ImageService validates remote image URLs and proxies safe image bytes via DNS-pinned hops.
type ImageService struct {
	opener ports.DownloadOpener
}

// NewImageService constructs an ImageService backed by a DNS-pinned DownloadOpener.
func NewImageService(opener ports.DownloadOpener) *ImageService {
	return &ImageService{opener: opener}
}

type limitedReadCloser struct {
	reader io.Reader
	closer io.Closer
}

func (l *limitedReadCloser) Read(p []byte) (int, error) { return l.reader.Read(p) }
func (l *limitedReadCloser) Close() error              { return l.closer.Close() }

// FetchImage validates rawURL, fetches it safely via PinnedDownloader, and enforces image/* content types.
func (s *ImageService) FetchImage(ctx context.Context, rawURL string) (io.ReadCloser, string, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return nil, "", domain.BadRequest("URL de imagem inválida.")
	}
	normalized, err := netsec.NormalizeDownloadURL(trimmed)
	if err != nil {
		return nil, "", domain.BadRequest("URL de imagem inválida.")
	}

	body, status, headers, err := s.opener.OpenPinned(ctx, normalized, ports.OpenPinnedOptions{
		Method:    http.MethodGet,
		UserAgent: netsec.BrowserUserAgent,
	})
	if err != nil {
		return nil, "", err
	}
	if status < 200 || status >= 300 {
		_ = body.Close()
		return nil, "", domain.BadGateway("Não foi possível carregar a imagem.", nil)
	}

	contentType := strings.ToLower(strings.TrimSpace(strings.SplitN(headers.Get("Content-Type"), ";", 2)[0]))
	if !strings.HasPrefix(contentType, "image/") || contentType == "image/svg+xml" {
		_ = body.Close()
		return nil, "", domain.BadGateway("O servidor remoto não retornou uma imagem válida.", nil)
	}

	return &limitedReadCloser{
		reader: io.LimitReader(body, maxProxiedImageBytes),
		closer: body,
	}, contentType, nil
}
