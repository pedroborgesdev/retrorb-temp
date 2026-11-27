package netsec

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

type stubResolver struct {
	ips map[string][]string
	err error
}

func (s stubResolver) LookupIPAddr(_ context.Context, host string) ([]string, error) {
	if s.err != nil {
		return nil, s.err
	}
	if addrs, ok := s.ips[host]; ok {
		return addrs, nil
	}
	return []string{"93.184.216.34"}, nil
}

type rtFunc func(*http.Request) (*http.Response, error)

func (f rtFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		name  string
		input *string
		want  string
	}{
		{"nil input", nil, "download.zip"},
		{"path traversal", strPtr("../../etc/passwd"), "passwd"},
		{"windows slashes and illegal chars", strPtr(`C:\roms\Game: "Final"?.zip`), "Game_ _Final__.zip"},
		{"dots only", strPtr(".."), "download.zip"},
		{"long filename preserves extension", strPtr(strings.Repeat("a", 200) + ".chd"), strings.Repeat("a", 150) + ".chd"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := SanitizeFilename(tt.input, "download.zip"); got != tt.want {
				t.Fatalf("SanitizeFilename() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseRangeStart(t *testing.T) {
	validStart := int64(1024)
	tests := []struct {
		name    string
		header  string
		want    *int64
		wantErr bool
	}{
		{"empty", "", nil, false},
		{"zero start", "bytes=0-", nil, false},
		{"positive start", "BYTES=1024-", &validStart, false},
		{"closed range rejected", "bytes=0-100", nil, true},
		{"invalid syntax", "items=10-", nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseRangeStart(tt.header)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if (got == nil) != (tt.want == nil) || (got != nil && *got != *tt.want) {
				t.Fatalf("ParseRangeStart(%q) = %v, want %v", tt.header, got, tt.want)
			}
		})
	}
}

func TestNormalizeDownloadURL(t *testing.T) {
	t.Run("encodes spaces and preserves safe query", func(t *testing.T) {
		got, err := NormalizeDownloadURL("https://cdn.example.com/roms/Super Mario (USA).zip?token=a+b&ok=1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := "https://cdn.example.com/roms/Super%20Mario%20(USA).zip?token=a+b&ok=1"
		if got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
	})

	invalid := []string{
		"http://cdn.example.com/a.zip",
		"https://romsfun.com/download/zelda",
		"https://user:pass@cdn.example.com/a.zip",
		"https://cdn.example.com:8443/a.zip",
		"https://cdn.example.com/a.zip#frag",
		`https://cdn.example.com/a\b.zip`,
		"https://cdn.example.com/a\nb.zip",
	}
	for _, raw := range invalid {
		if _, err := NormalizeDownloadURL(raw); err == nil {
			t.Errorf("expected error for invalid URL %q", raw)
		}
	}
}

func TestNormalizeGameDownloads(t *testing.T) {
	badURL := "http://insecure.example/rom.zip"
	goodURL := "https://cdn.example.com/files/Chrono%20Trigger.7z"
	nameNoExt := "Chrono Trigger"
	details := domain.GameDetails{
		Downloads: []domain.DownloadDetails{
			{Filename: &nameNoExt, DownloadURL: &goodURL},
			{Filename: strPtr("Broken"), DownloadURL: &badURL},
		},
	}

	got := NormalizeGameDownloads(details)
	if got.Downloads[0].Filename == nil || *got.Downloads[0].Filename != "Chrono Trigger.7z" {
		t.Fatalf("expected resolved extension, got %v", got.Downloads[0].Filename)
	}
	if got.Downloads[1].DownloadURL != nil {
		t.Fatalf("expected invalid URL to become nil, got %v", *got.Downloads[1].DownloadURL)
	}
}

func TestEnsurePublicHTTPSURL_BlocksPrivateAndCGNAT(t *testing.T) {
	for _, blockedIP := range []string{"127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fc00::1", "fe80::1"} {
		_, _, err := EnsurePublicHTTPSURL(context.Background(), stubResolver{ips: map[string][]string{"evil.test": {blockedIP}}}, "https://evil.test/file.zip")
		if err == nil {
			t.Errorf("expected SSRF block for IP %s", blockedIP)
		}
	}
	_, addrs, err := EnsurePublicHTTPSURL(context.Background(), stubResolver{ips: map[string][]string{"cdn.example": {"93.184.216.34"}}}, "https://cdn.example/file.zip")
	if err != nil || len(addrs) != 1 || addrs[0] != "93.184.216.34" {
		t.Fatalf("expected public IP allowed, got addrs=%v err=%v", addrs, err)
	}
}

func TestPinnedDownloader_RedirectsRangeAndGuards(t *testing.T) {
	t.Run("blocks redirect to private IP", func(t *testing.T) {
		resolver := stubResolver{ips: map[string][]string{
			"cdn.example": {"93.184.216.34"},
			"127.0.0.1":   {"127.0.0.1"},
		}}
		dl := NewPinnedDownloaderWithTransport(resolver, func(_, _ string) http.RoundTripper {
			return rtFunc(func(_ *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusFound,
					Header:     http.Header{"Location": []string{"https://127.0.0.1/secret"}},
					Body:       io.NopCloser(strings.NewReader("")),
				}, nil
			})
		})
		_, _, _, err := dl.OpenPinned(context.Background(), "https://cdn.example/file.zip", ports.OpenPinnedOptions{Referer: "https://wowroms.com/"})
		if err == nil {
			t.Fatal("expected redirect to loopback to be blocked")
		}
	})

	t.Run("follows POST->GET redirect, sends Range, and streams 206", func(t *testing.T) {
		var seen []string
		resolver := stubResolver{ips: map[string][]string{
			"wow.example":  {"93.184.216.34"},
			"cdn2.example": {"93.184.216.35"},
		}}
		dl := NewPinnedDownloaderWithTransport(resolver, func(pinnedIP, serverName string) http.RoundTripper {
			return rtFunc(func(req *http.Request) (*http.Response, error) {
				seen = append(seen, req.Method+"@"+pinnedIP+"@"+serverName+"@"+req.Header.Get("Range"))
				if serverName == "wow.example" {
					return &http.Response{
						StatusCode: http.StatusFound,
						Header:     http.Header{"Location": []string{"https://cdn2.example/rom.zip"}},
						Body:       io.NopCloser(strings.NewReader("")),
					}, nil
				}
				return &http.Response{
					StatusCode: http.StatusPartialContent,
					Header: http.Header{
						"Content-Type":   []string{"application/zip"},
						"Content-Length": []string{"4"},
						"Content-Range":  []string{"bytes 4-7/8"},
					},
					Body: io.NopCloser(strings.NewReader("5678")),
				}, nil
			})
		})

		start := int64(4)
		body, status, headers, err := dl.OpenPinned(context.Background(), "https://wow.example/dl", ports.OpenPinnedOptions{
			Referer:    "https://wowroms.com/",
			Method:     "POST",
			FormData:   map[string]string{"token": "abc"},
			RangeStart: &start,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		defer body.Close()
		payload, _ := io.ReadAll(body)
		if status != 206 || string(payload) != "5678" || headers.Get("Content-Range") != "bytes 4-7/8" {
			t.Fatalf("unexpected response status=%d payload=%q headers=%v", status, payload, headers)
		}
		if len(seen) != 2 || seen[0] != "POST@93.184.216.34@wow.example@bytes=4-" || seen[1] != "GET@93.184.216.35@cdn2.example@bytes=4-" {
			t.Fatalf("unexpected hops: %v", seen)
		}
	})

	t.Run("maps 416 and rejects HTML payloads", func(t *testing.T) {
		dl416 := NewPinnedDownloaderWithTransport(stubResolver{}, func(_, _ string) http.RoundTripper {
			return rtFunc(func(_ *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 416, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(""))}, nil
			})
		})
		_, _, _, err := dl416.OpenPinned(context.Background(), "https://cdn.example/a.zip", ports.OpenPinnedOptions{Referer: "https://romsfun.com/"})
		var appErr *domain.AppError
		if !errors.As(err, &appErr) || appErr.Status != 416 {
			t.Fatalf("expected 416 AppError, got %v", err)
		}

		dlHTML := NewPinnedDownloaderWithTransport(stubResolver{}, func(_, _ string) http.RoundTripper {
			return rtFunc(func(_ *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: 200,
					Header:     http.Header{"Content-Type": []string{"text/html; charset=utf-8"}},
					Body:       io.NopCloser(strings.NewReader("<html>not a rom</html>")),
				}, nil
			})
		})
		_, _, _, err = dlHTML.OpenPinned(context.Background(), "https://cdn.example/a.zip", ports.OpenPinnedOptions{Referer: "https://romsfun.com/"})
		if err == nil {
			t.Fatal("expected HTML content-type to be rejected")
		}
	})
}

func strPtr(s string) *string { return &s }
