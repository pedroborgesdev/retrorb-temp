package application

import (
	"context"
	"encoding/xml"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/catalog"
	"retromancy/api/internal/infrastructure/providers"
	"retromancy/api/internal/infrastructure/providers/romsfun"
	"retromancy/api/internal/infrastructure/providers/romsgames"
	"retromancy/api/internal/infrastructure/providers/romspure"
	"retromancy/api/internal/infrastructure/providers/wowroms"
	"retromancy/api/internal/ports"
)

type fakeProvider struct {
	id         string
	label      string
	domain     string
	searchFn   func(ctx context.Context, query string, page int) (domain.SearchPage, error)
	detailsFn  func(ctx context.Context, url string) (domain.GameDetails, error)
	parseFn    func(html string) []domain.SearchResult
	hasNextFn  func(html string, page int) bool
	enrichFn   func(ctx context.Context, results []domain.SearchResult, hasMore func() bool) []domain.SearchResult
	resolveFn  func(ctx context.Context, url string, idx int, expected *string) (domain.ProviderDownload, error)
}

func (f fakeProvider) ID() string                 { return f.id }
func (f fakeProvider) Label() string              { return f.label }
func (f fakeProvider) Domain() string             { return f.domain }
func (f fakeProvider) SearchBudgetSeconds() int   { return 18 }
func (f fakeProvider) RequestTimeoutSeconds() int { return 15 }
func (f fakeProvider) RequestHeaders() map[string]string {
	return map[string]string{"User-Agent": providers.BrowserUserAgent}
}
func (f fakeProvider) Search(ctx context.Context, q string, p int) (domain.SearchPage, error) {
	return f.searchFn(ctx, q, p)
}
func (f fakeProvider) Details(ctx context.Context, u string) (domain.GameDetails, error) {
	return f.detailsFn(ctx, u)
}
func (f fakeProvider) ParseSearchResults(h string) []domain.SearchResult { return f.parseFn(h) }
func (f fakeProvider) HasNextPage(h string, p int) bool                  { return f.hasNextFn(h, p) }
func (f fakeProvider) EnrichConsoleResults(ctx context.Context, r []domain.SearchResult, hm func() bool) []domain.SearchResult {
	if f.enrichFn != nil {
		return f.enrichFn(ctx, r, hm)
	}
	return r
}

type fakeAIClient struct {
	fn func(ctx context.Context, apiKey string, model *string, title string, console *string, src *string) (domain.DescribeResponse, error)
}

func (f fakeAIClient) GenerateDescription(ctx context.Context, apiKey string, model *string, title string, console *string, src *string) (domain.DescribeResponse, error) {
	return f.fn(ctx, apiKey, model, title, console, src)
}

type doerFunc func(*http.Request) (*http.Response, error)

func (f doerFunc) Do(r *http.Request) (*http.Response, error) { return f(r) }

func TestSearchService_PartialFailureDoesNotFailAggregateOrLeakSecret(t *testing.T) {
	reg := providers.NewRegistry(
		fakeProvider{
			id: "romsfun", label: "RomsFun", domain: "romsfun.com",
			searchFn: func(_ context.Context, _ string, page int) (domain.SearchPage, error) {
				title := "A"
				return domain.SearchPage{Results: []domain.SearchResult{{Title: &title}}, Page: page}, nil
			},
		},
		fakeProvider{
			id: "romspure", label: "RomsPure", domain: "romspure.cc",
			searchFn: func(_ context.Context, _ string, _ int) (domain.SearchPage, error) {
				return domain.SearchPage{}, errors.New("Internal token should not be exposed")
			},
		},
	)

	svc := NewSearchService(reg, nil, nil)
	resp, err := svc.Search(context.Background(), domain.ConsoleQuery{Query: "Pokemon", Page: 1})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Sources) != 2 {
		t.Fatalf("expected 2 sources, got %d", len(resp.Sources))
	}
	if resp.Sources["romspure"].Error == nil || strings.Contains(*resp.Sources["romspure"].Error, "Internal token") {
		t.Fatalf("expected safe error message, got %v", resp.Sources["romspure"].Error)
	}
	if len(resp.Sources["romsfun"].Results) != 1 || *resp.Sources["romsfun"].Results[0].Title != "A" {
		t.Fatalf("unexpected romsfun results: %+v", resp.Sources["romsfun"].Results)
	}
}

func TestSearchService_ConsoleFilteredQueriesAndPreFilters(t *testing.T) {
	catalogPath := filepath.Join("..", "..", "..", "contexto", "consoles-definitive.json")
	if _, err := os.Stat(catalogPath); err != nil {
		t.Fatalf("missing catalog fixture: %v", err)
	}
	repo := catalog.NewFileRepository(catalogPath)

	var seenRequests []string
	mockClient := func(_ time.Duration) ports.HTTPDoer {
		return doerFunc(func(req *http.Request) (*http.Response, error) {
			seenRequests = append(seenRequests, req.URL.String())
			u := req.URL.String()
			switch {
			case strings.Contains(u, "romspure.cc/browse-roms/"):
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("<html></html>"))}, nil
			case strings.Contains(u, "wowroms.com/en/roms/list"):
				body := `<li class="element"><a class="title-5" title="Black Sigil" href="https://wowroms.com/en/roms/nintendo-ds/black-sigil/123.html">Black Sigil</a></li><li class="element"><a class="title-5" title="Wrong" href="https://wowroms.com/en/roms/gameboy/black/456.html">Wrong</a></li><li class="next"><a href="?search=black&amp;page=2">Next</a></li>`
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
			case strings.Contains(u, "www.romsgames.net/search/"):
				body := `<a class="shadow-lg" href="/nintendo-ds-rom-pokemon-black/"><img alt="Pokemon Black"></a><a class="shadow-lg" href="/playstation-2-rom-black/"><img alt="Black"></a>`
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
			default:
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("<html>No JSON-LD</html>"))}, nil
			}
		})
	}

	reg := providers.NewRegistry(
		romsfun.NewProvider(mockClient),
		romspure.NewProvider(mockClient),
		romsgames.NewProvider(mockClient),
		wowroms.NewProvider(mockClient),
	)
	svc := NewSearchService(reg, repo, mockClient)

	t.Run("romspure forwards hidden console id and popular sort", func(t *testing.T) {
		seenRequests = nil
		src := "romspure"
		resp, err := svc.Search(context.Background(), domain.ConsoleQuery{Query: "black", ConsoleName: "PS2", Source: &src, Page: 2})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Sources["romspure"].Error != nil || len(seenRequests) != 1 {
			t.Fatalf("unexpected response/requests: resp=%+v seen=%v", resp, seenRequests)
		}
		if !strings.Contains(seenRequests[0], "romspure.cc/browse-roms/page/2/") ||
			!strings.Contains(seenRequests[0], "console=2990") ||
			!strings.Contains(seenRequests[0], "sort=popular") {
			t.Fatalf("missing console filter params in URL: %s", seenRequests[0])
		}
	})

	t.Run("wowroms keeps console from URL when card omits it", func(t *testing.T) {
		src := "wowroms"
		resp, err := svc.Search(context.Background(), domain.ConsoleQuery{Query: "black", ConsoleName: "Nintendo DS", Source: &src, Page: 1})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		ds := resp.Sources["wowroms"]
		if !ds.Pagination.HasNext || len(ds.Results) != 1 || *ds.Results[0].Title != "Black Sigil" {
			t.Fatalf("unexpected wowroms results: %+v", ds)
		}
	})

	t.Run("romsgames filters URLs before enrichment and skips page 2", func(t *testing.T) {
		seenRequests = nil
		src := "romsgames"
		resp, err := svc.Search(context.Background(), domain.ConsoleQuery{Query: "black", ConsoleName: "PS2", Source: &src, Page: 1})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		rg := resp.Sources["romsgames"]
		if rg.Pagination.HasNext || len(rg.Results) != 1 || *rg.Results[0].Title != "Black" {
			t.Fatalf("unexpected romsgames results: %+v", rg)
		}
		if len(seenRequests) != 2 || !strings.HasSuffix(seenRequests[1], "/playstation-2-rom-black/") {
			t.Fatalf("expected enrichment only for PS2 URL, got %v", seenRequests)
		}

		seenRequests = nil
		resp2, err := svc.Search(context.Background(), domain.ConsoleQuery{Query: "black", ConsoleName: "PS2", Source: &src, Page: 2})
		if err != nil || len(seenRequests) != 0 || len(resp2.Sources["romsgames"].Results) != 0 {
			t.Fatalf("expected unpaginated page 2 to avoid HTTP calls, got seen=%v resp=%+v", seenRequests, resp2)
		}
	})
}

func TestAIService_TokenPrecedenceAndValidation(t *testing.T) {
	var seenKey string
	svc := NewAIService(fakeAIClient{
		fn: func(_ context.Context, apiKey string, _ *string, _ string, _ *string, _ *string) (domain.DescribeResponse, error) {
			seenKey = apiKey
			desc := "ok"
			return domain.DescribeResponse{Available: true, Description: &desc, Model: "openai/gpt-oss-120b"}, nil
		},
	}, "hf_env_secret")

	title := "EarthBound"
	if _, err := svc.DescribeGame(context.Background(), domain.DescribeRequest{Title: &title}); err != nil || seenKey != "hf_env_secret" {
		t.Fatalf("expected env fallback token, got key=%q err=%v", seenKey, err)
	}

	bodyKey := "hf_body"
	if _, err := svc.DescribeGame(context.Background(), domain.DescribeRequest{HeaderToken: "hf_hdr", APIKey: &bodyKey, Title: &title}); err != nil || seenKey != "hf_hdr" {
		t.Fatalf("expected header precedence, got key=%q err=%v", seenKey, err)
	}

	var _ xml.Attr
}

type progressiveFakeProvider struct {
	fakeProvider
	streamFn func(ctx context.Context, url string, emit func(domain.GameDetails)) (domain.GameDetails, error)
}

func (p progressiveFakeProvider) DetailsStream(
	ctx context.Context,
	url string,
	emit func(domain.GameDetails),
) (domain.GameDetails, error) {
	return p.streamFn(ctx, url, emit)
}

func TestGameService_StreamDetailsStagesCodesAndCache(t *testing.T) {
	calls := 0
	name := "Chrono Trigger"
	file := "chrono.zip"
	dlURL := "https://files.romsfun.com/chrono.zip"

	reg := providers.NewRegistry(progressiveFakeProvider{
		fakeProvider: fakeProvider{id: "romsfun", label: "RomsFun", domain: "romsfun.com"},
		streamFn: func(_ context.Context, _ string, emit func(domain.GameDetails)) (domain.GameDetails, error) {
			calls++
			base := domain.GameDetails{Name: &name}
			if emit != nil {
				emit(base)
			}
			withList := base
			withList.Downloads = []domain.DownloadDetails{{Filename: &file}}
			if emit != nil {
				emit(withList)
			}
			final := base
			final.Downloads = []domain.DownloadDetails{{Filename: &file, DownloadURL: &dlURL}}
			return final, nil
		},
	})

	svc := NewGameService(reg, nil)
	gameURL := "https://romsfun.com/roms/super-nintendo/chrono-trigger.html"

	var stages []string
	var payloads []domain.GameResponse
	resp, err := svc.StreamDetails(context.Background(), "romsfun", gameURL, func(stage string, r domain.GameResponse) {
		stages = append(stages, stage)
		payloads = append(payloads, r)
	})
	if err != nil {
		t.Fatalf("StreamDetails failed: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected 1 provider call, got %d", calls)
	}
	if strings.Join(stages, ",") != "details,downloads,done" {
		t.Fatalf("expected stages details,downloads,done; got %v", stages)
	}
	if len(payloads[0].Game.Downloads) != 0 {
		t.Fatalf("expected no downloads in details stage, got %+v", payloads[0].Game.Downloads)
	}
	if len(payloads[1].Game.Downloads) != 1 || payloads[1].Game.Downloads[0].Code != nil {
		t.Fatalf("expected unresolved download without code in downloads stage, got %+v", payloads[1].Game.Downloads)
	}
	if len(resp.Game.Downloads) != 1 || resp.Game.Downloads[0].Code == nil || !strings.HasPrefix(*resp.Game.Downloads[0].Code, "RO1-") {
		t.Fatalf("expected RO1 code in final response, got %+v", resp.Game.Downloads)
	}

	var cachedStages []string
	cachedResp, err := svc.StreamDetails(context.Background(), "romsfun", gameURL, func(stage string, _ domain.GameResponse) {
		cachedStages = append(cachedStages, stage)
	})
	if err != nil {
		t.Fatalf("cached StreamDetails failed: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected cache hit without second provider call, got calls=%d", calls)
	}
	if strings.Join(cachedStages, ",") != "done" || cachedResp.Game.Name == nil || *cachedResp.Game.Name != name {
		t.Fatalf("unexpected cached stream result: stages=%v resp=%+v", cachedStages, cachedResp)
	}
}

type trackingReadCloser struct {
	readCalled   atomic.Bool
	closedCalled atomic.Bool
}

func (t *trackingReadCloser) Read(_ []byte) (int, error) {
	t.readCalled.Store(true)
	return 0, io.EOF
}

func (t *trackingReadCloser) Close() error {
	t.closedCalled.Store(true)
	return nil
}

type fakeDownloadOpener func(ctx context.Context, url string, opts ports.OpenPinnedOptions) (io.ReadCloser, int, http.Header, error)

func (f fakeDownloadOpener) OpenPinned(ctx context.Context, url string, opts ports.OpenPinnedOptions) (io.ReadCloser, int, http.Header, error) {
	return f(ctx, url, opts)
}

func TestGameService_ProbesDownloadsAndMarksRefusedUnavailable(t *testing.T) {
	name := "Super Metroid"
	f0 := "metroid-ok.zip"
	f1 := "metroid-403.zip"
	u0 := "https://cdn.romsfun.com/metroid-ok.zip"
	u1 := "https://cdn.romsfun.com/metroid-403.zip"

	reg := providers.NewRegistry(progressiveFakeProvider{
		fakeProvider: fakeProvider{id: "romsfun", label: "RomsFun", domain: "romsfun.com"},
		streamFn: func(_ context.Context, _ string, emit func(domain.GameDetails)) (domain.GameDetails, error) {
			d := domain.GameDetails{Name: &name}
			if emit != nil {
				emit(providers.CloneGameDetails(d))
			}
			d.Downloads = []domain.DownloadDetails{
				{Filename: &f0},
				{Filename: &f1},
			}
			if emit != nil {
				emit(providers.CloneGameDetails(d))
			}
			d.Downloads[1].DownloadURL = &u1
			if emit != nil {
				emit(providers.CloneGameDetails(d))
			}
			d.Downloads[0].DownloadURL = &u0
			if emit != nil {
				emit(providers.CloneGameDetails(d))
			}
			return d, nil
		},
	})

	tracker := &trackingReadCloser{}
	opener := fakeDownloadOpener(func(_ context.Context, target string, _ ports.OpenPinnedOptions) (io.ReadCloser, int, http.Header, error) {
		if target == u1 {
			return nil, 0, nil, domain.BadGateway("O servidor remoto recusou o download (HTTP 403).", nil)
		}
		return tracker, http.StatusOK, http.Header{}, nil
	})

	svc := NewGameService(reg, opener)
	gameURL := "https://romsfun.com/roms/super-nintendo/super-metroid.html"

	var emitted []domain.GameResponse
	finalResp, err := svc.StreamDetails(context.Background(), "romsfun", gameURL, func(_ string, r domain.GameResponse) {
		emitted = append(emitted, r)
	})
	if err != nil {
		t.Fatalf("StreamDetails failed: %v", err)
	}

	if !tracker.closedCalled.Load() || tracker.readCalled.Load() {
		t.Fatalf("expected probe to close body without reading bytes: closed=%v read=%v", tracker.closedCalled.Load(), tracker.readCalled.Load())
	}

	for idx, ev := range emitted {
		if len(ev.Game.Downloads) > 1 {
			if ev.Game.Downloads[1].DownloadURL != nil || ev.Game.Downloads[1].Code != nil {
				t.Fatalf("event %d leaked refused download_url or code: %+v", idx, ev.Game.Downloads[1])
			}
		}
	}

	if len(finalResp.Game.Downloads) != 2 {
		t.Fatalf("expected 2 downloads, got %d", len(finalResp.Game.Downloads))
	}
	if finalResp.Game.Downloads[0].DownloadURL == nil || *finalResp.Game.Downloads[0].DownloadURL != u0 || finalResp.Game.Downloads[0].Code == nil {
		t.Fatalf("expected file 0 verified with URL and RO1 code, got %+v", finalResp.Game.Downloads[0])
	}
	if finalResp.Game.Downloads[1].DownloadURL != nil || finalResp.Game.Downloads[1].Code != nil {
		t.Fatalf("expected file 1 marked unavailable (nil URL and nil Code), got %+v", finalResp.Game.Downloads[1])
	}
}
