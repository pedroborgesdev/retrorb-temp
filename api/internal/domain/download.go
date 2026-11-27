package domain

import (
	"io"
	"net/http"
)

// ProviderDownload describes a resolved direct download target for a provider file.
type ProviderDownload struct {
	URL       string
	Filename  string
	MediaType *string
	Size      *string
	Method    string
	FormData  map[string]string
	Referer   string
}

// PinnedStream wraps an opened remote response bound to a DNS-validated public IP.
type PinnedStream struct {
	Status  int
	Headers http.Header
	Body    io.ReadCloser
	URL     string
}

// DownloadStream combines the resolved metadata with the opened pinned HTTP stream.
type DownloadStream struct {
	Filename string
	Status   int
	Headers  http.Header
	Body     io.ReadCloser
}
