package ports

import (
	"context"
	"io"
	"net/http"
)

// HTTPDoer abstracts *http.Client for testability and dependency injection.
type HTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

// IPResolver resolves hostnames to IP addresses, enabling deterministic SSRF tests.
type IPResolver interface {
	LookupIPAddr(ctx context.Context, host string) ([]string, error)
}

// DownloadOpener opens a DNS-pinned remote stream for a resolved download target.
type DownloadOpener interface {
	OpenPinned(ctx context.Context, targetURL string, opts OpenPinnedOptions) (io.ReadCloser, int, http.Header, error)
}

// OpenPinnedOptions configures a pinned HTTPS download request.
type OpenPinnedOptions struct {
	Referer    string
	Method     string
	FormData   map[string]string
	RangeStart *int64
	UserAgent  string
}
