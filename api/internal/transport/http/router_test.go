package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"retromancy/api/internal/application"
	"retromancy/api/internal/config"
	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/catalog"
	"retromancy/api/internal/infrastructure/providers"
	httptransport "retromancy/api/internal/transport/http"
	"retromancy/api/internal/transport/http/handler"
	"retromancy/api/internal/ports"
)

type stubProvider struct {
	id         string
	label      string
	domain     string
	searchFn   func(ctx context.Context, q string, p int) (domain.SearchPage, error)
	detailsFn  func(ctx context.Context, url string) (domain.GameDetails, error)
}

func (s stubProvider) ID() string                 { return s.id }
func (s stubProvider) Label() string              { return s.label }
func (s stubProvider) Domain() string             { return s.domain }
func (s stubProvider) SearchBudgetSeconds() int   { return 18 }
func (s stubProvider) RequestTimeoutSeconds() int { return 15 }
func (s stubProvider) RequestHeaders() map[string]string {
	return map[string]string{"User-Agent": providers.BrowserUserAgent}
}
func (s stubProvider) Search(ctx context.Context, q string, p int) (domain.SearchPage, error) {
	return s.searchFn(ctx, q, p)
}
func (s stubProvider) Details(ctx context.Context, u string) (domain.GameDetails, error) {
	return s.detailsFn(ctx, u)
}
func (s stubProvider) ParseSearchResults(_ string) []domain.SearchResult { return nil }
func (s stubProvider) HasNextPage(_ string, _ int) bool                  { return false }
func (s stubProvider) EnrichConsoleResults(_ context.Context, r []domain.SearchResult, _ func() bool) []domain.SearchResult {
	return r
}

type stubOpener func(ctx context.Context, url string, opts ports.OpenPinnedOptions) (io.ReadCloser, int, http.Header, error)

func (f stubOpener) OpenPinned(ctx context.Context, u string, o ports.OpenPinnedOptions) (io.ReadCloser, int, http.Header, error) {
	return f(ctx, u, o)
}

type stubAI func(ctx context.Context, key string, model *string, title string, console *string, src *string) (domain.DescribeResponse, error)

func (f stubAI) GenerateDescription(ctx context.Context, key string, model *string, title string, console *string, src *string) (domain.DescribeResponse, error) {
	return f(ctx, key, model, title, console, src)
}

func buildTestRouter(
	t *testing.T,
	reg ports.ProviderRegistry,
	catalogPath string,
	opener ports.DownloadOpener,
	aiClient ports.AIClient,
	envToken string,
) http.Handler {
	t.Helper()
	if reg == nil {
		reg = providers.NewRegistry(stubProvider{id: "romsfun", label: "RomsFun", domain: "romsfun.com"})
	}
	repo := catalog.NewFileRepository(catalogPath)
	cfg := config.Config{
		APIPort:            "5000",
		CORSOrigins:        []string{"http://127.0.0.1:5173", "http://localhost:5173"},
		TrustedHosts:       []string{"localhost", "127.0.0.1", "::1"},
		HFToken:            envToken,
		ConsoleCatalogPath: catalogPath,
	}
	downloadSvc := application.NewDownloadService(reg, opener)
	gameSvc := application.NewGameService(reg, opener)
	return httptransport.NewRouter(httptransport.RouterDeps{
		Config:   cfg,
		Health:   handler.NewHealthHandler(),
		Consoles: handler.NewConsoleHandler(application.NewConsoleService(repo), nil),
		Search:   handler.NewSearchHandler(application.NewSearchService(reg, repo, nil), nil),
		Game:     handler.NewGameHandler(gameSvc, nil),
		AI:       handler.NewAIHandler(application.NewAIService(aiClient, envToken), nil),
		Download: handler.NewDownloadHandler(downloadSvc, nil),
		Roms:     handler.NewRomHandler(application.NewRomCodeService(reg, gameSvc, downloadSvc), nil),
		Image:    handler.NewImageHandler(application.NewImageService(opener), nil),
	})
}

func realCatalogPath(t *testing.T) string {
	t.Helper()
	p := filepath.Join("..", "..", "..", "..", "contexto", "consoles-definitive.json")
	if _, err := os.Stat(p); err != nil {
		t.Fatalf("missing catalog file: %v", err)
	}
	return p
}

func TestSecurityMiddleware_CORSAndTrustedHost(t *testing.T) {
	router := buildTestRouter(t, nil, realCatalogPath(t), nil, nil, "")

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Host = "127.0.0.1:5000"
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for untrusted origin, got %d", rec.Code)
	}

	reqBadHost := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqBadHost.Host = "evil.example"
	recBadHost := httptest.NewRecorder()
	router.ServeHTTP(recBadHost, reqBadHost)
	if recBadHost.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for untrusted host, got %d", recBadHost.Code)
	}

	reqGood := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqGood.Host = "127.0.0.1:5000"
	reqGood.Header.Set("Origin", "http://127.0.0.1:5173")
	recGood := httptest.NewRecorder()
	router.ServeHTTP(recGood, reqGood)
	if recGood.Code != http.StatusOK || recGood.Header().Get("Access-Control-Allow-Origin") != "http://127.0.0.1:5173" {
		t.Fatalf("unexpected health/CORS response: %d headers=%v", recGood.Code, recGood.Header())
	}

	reqNull := httptest.NewRequest(http.MethodOptions, "/api/ai/describe", nil)
	reqNull.Host = "localhost:5000"
	reqNull.Header.Set("Origin", "null")
	recNull := httptest.NewRecorder()
	router.ServeHTTP(recNull, reqNull)
	if recNull.Code != http.StatusNoContent || recNull.Header().Get("Access-Control-Allow-Origin") != "null" {
		t.Fatalf("expected 204 for Electron null origin preflight, got %d headers=%v", recNull.Code, recNull.Header())
	}
}

func TestConsolesEndpoint_MatchesDefinitiveJSON(t *testing.T) {
	catPath := realCatalogPath(t)
	router := buildTestRouter(t, nil, catPath, nil, nil, "")

	req := httptest.NewRequest(http.MethodGet, "/api/consoles", nil)
	req.Host = "127.0.0.1:5000"
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got domain.ConsoleCatalog
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	raw, _ := os.ReadFile(catPath)
	var expected domain.ConsoleCatalog
	_ = json.Unmarshal(raw, &expected)
	if len(got.Consoles) == 0 || len(got.Consoles) != len(expected.Consoles) {
		t.Fatalf("console count mismatch: got %d want %d", len(got.Consoles), len(expected.Consoles))
	}
}

func TestGameEndpoint_PreservesExplicitNullFieldsAndGuardsErrors(t *testing.T) {
	reg := providers.NewRegistry(
		stubProvider{
			id: "romsfun", label: "RomsFun", domain: "romsfun.com",
			detailsFn: func(_ context.Context, _ string) (domain.GameDetails, error) {
				return domain.GameDetails{}, nil
			},
		},
		stubProvider{
			id: "wowroms", label: "WowRoms", domain: "wowroms.com",
			detailsFn: func(_ context.Context, _ string) (domain.GameDetails, error) {
				return domain.GameDetails{}, errors.New("secret upstream error")
			},
		},
	)
	router := buildTestRouter(t, reg, realCatalogPath(t), nil, nil, "")

	req := httptest.NewRequest(http.MethodGet, "/api/game?source=romsfun&url=https://romsfun.com/roms/test.html", nil)
	req.Host = "127.0.0.1:5000"
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var payload map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &payload)
	gameObj := payload["game"].(map[string]any)
	for _, field := range []string{"name", "description", "release_date", "reviews_count", "stars_rate", "publisher", "regions", "icon", "screenshots", "downloads"} {
		val, exists := gameObj[field]
		if !exists || val != nil {
			t.Fatalf("expected explicit null for %q, exists=%v val=%v", field, exists, val)
		}
	}

	badReq := httptest.NewRequest(http.MethodGet, "/api/game?source=romsfun&url=https://127.0.0.1/game", nil)
	badReq.Host = "127.0.0.1:5000"
	badRec := httptest.NewRecorder()
	router.ServeHTTP(badRec, badReq)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on invalid URL, got %d", badRec.Code)
	}

	failReq := httptest.NewRequest(http.MethodGet, "/api/game?source=wowroms&url=https://wowroms.com/en/roms/gba/x/1.html", nil)
	failReq.Host = "127.0.0.1:5000"
	failRec := httptest.NewRecorder()
	router.ServeHTTP(failRec, failReq)
	if failRec.Code != http.StatusBadGateway || strings.Contains(failRec.Body.String(), "secret") {
		t.Fatalf("expected safe 502 without leaking secret, got %d %s", failRec.Code, failRec.Body.String())
	}
}

func TestAIDescribeEndpoint_ContractsAndValidation(t *testing.T) {
	var capturedKey string
	aiStub := stubAI(func(_ context.Context, key string, _ *string, title string, _ *string, _ *string) (domain.DescribeResponse, error) {
		capturedKey = key
		if title == "Unknown" {
			return domain.DescribeResponse{Available: false, Description: nil, Model: "openai/gpt-oss-120b"}, nil
		}
		desc := "### Castlevania\n\nDescrição gerada."
		return domain.DescribeResponse{Available: true, Description: &desc, Model: "openai/gpt-oss-120b"}, nil
	})
	router := buildTestRouter(t, nil, realCatalogPath(t), nil, aiStub, "")

	req := httptest.NewRequest(http.MethodPost, "/api/ai/describe", bytes.NewBufferString(`{"title":"Castlevania","console":"Game Boy Advance","source_description":"Classic"}`))
	req.Host = "127.0.0.1:5000"
	req.Header.Set("Origin", "http://127.0.0.1:5173")
	req.Header.Set("X-HF-Token", "hf_header_token")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || capturedKey != "hf_header_token" {
		t.Fatalf("expected 200 with header token, got %d body=%s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://127.0.0.1:5173" || !strings.Contains(rec.Header().Get("Access-Control-Allow-Headers"), "X-HF-Token") {
		t.Fatalf("missing CORS headers on AI response: %v", rec.Header())
	}

	badType := httptest.NewRequest(http.MethodPost, "/api/ai/describe", bytes.NewBufferString(`{"title":"Castlevania","console":123}`))
	badType.Host = "127.0.0.1:5000"
	badType.Header.Set("X-HF-Token", "hf_header_token")
	recBad := httptest.NewRecorder()
	router.ServeHTTP(recBad, badType)
	if recBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-string console, got %d", recBad.Code)
	}
}

func TestDownloadEndpoint_Range206AndConflict(t *testing.T) {
	dlURL := "https://cdn.romsfun.com/mario.zip"
	reg := providers.NewRegistry(stubProvider{
		id: "romsfun", label: "RomsFun", domain: "romsfun.com",
		detailsFn: func(_ context.Context, _ string) (domain.GameDetails, error) {
			name := "Mario"
			return domain.GameDetails{
				Downloads: []domain.DownloadDetails{{Filename: &name, DownloadURL: &dlURL}},
			}, nil
		},
	})
	opener := stubOpener(func(_ context.Context, _ string, opts ports.OpenPinnedOptions) (io.ReadCloser, int, http.Header, error) {
		if opts.RangeStart == nil || *opts.RangeStart != 4 {
			return nil, 0, nil, errors.New("expected range start 4")
		}
		return io.NopCloser(strings.NewReader("5678")), http.StatusPartialContent, http.Header{
			"Content-Length": []string{"4"},
			"Content-Range":  []string{"bytes 4-7/8"},
		}, nil
	})
	router := buildTestRouter(t, reg, realCatalogPath(t), opener, nil, "")

	req := httptest.NewRequest(http.MethodGet, "/api/download?source=romsfun&url=https://romsfun.com/roms/mario.html&file=0&filename=Mario.zip", nil)
	req.Host = "127.0.0.1:5000"
	req.Header.Set("Range", "bytes=4-")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusPartialContent || rec.Body.String() != "5678" || rec.Header().Get("Content-Range") != "bytes 4-7/8" {
		t.Fatalf("unexpected 206 stream response: code=%d body=%q headers=%v", rec.Code, rec.Body.String(), rec.Header())
	}

	reqMismatch := httptest.NewRequest(http.MethodGet, "/api/download?source=romsfun&url=https://romsfun.com/roms/mario.html&file=0&filename=Other.zip", nil)
	reqMismatch.Host = "127.0.0.1:5000"
	recMismatch := httptest.NewRecorder()
	router.ServeHTTP(recMismatch, reqMismatch)
	if recMismatch.Code != http.StatusConflict {
		t.Fatalf("expected 409 on filename mismatch, got %d", recMismatch.Code)
	}
}

func TestRomCodeEndpoints_DecodeResolveAndStream(t *testing.T) {
	dl0 := "https://cdn.romsfun.com/other.zip"
	dl1 := "https://cdn.romsfun.com/firered.zip"
	reg := providers.NewRegistry(stubProvider{
		id: "romsfun", label: "RomsFun", domain: "romsfun.com",
		detailsFn: func(_ context.Context, _ string) (domain.GameDetails, error) {
			n0, n1 := "Other", "FireRed"
			return domain.GameDetails{
				Name: strPtr("Pokemon FireRed"),
				Downloads: []domain.DownloadDetails{
					{Filename: &n0, DownloadURL: &dl0},
					{Filename: &n1, DownloadURL: &dl1},
				},
			}, nil
		},
	})
	opener := stubOpener(func(_ context.Context, target string, _ ports.OpenPinnedOptions) (io.ReadCloser, int, http.Header, error) {
		if target != dl1 {
			return nil, 0, nil, errors.New("wrong target URL")
		}
		return io.NopCloser(strings.NewReader("ROMDATA")), http.StatusOK, http.Header{"Content-Length": []string{"7"}}, nil
	})
	router := buildTestRouter(t, reg, realCatalogPath(t), opener, nil, "")

	// 1. /api/game emits compact RO1 code for each valid download
	gameReq := httptest.NewRequest(http.MethodGet, "/api/game?source=romsfun&url=https://romsfun.com/roms/game-boy-advance/pokemon-fire-red.html", nil)
	gameReq.Host = "127.0.0.1:5000"
	gameRec := httptest.NewRecorder()
	router.ServeHTTP(gameRec, gameReq)
	if gameRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", gameRec.Code)
	}
	var gameResp domain.GameResponse
	_ = json.Unmarshal(gameRec.Body.Bytes(), &gameResp)
	if len(gameResp.Game.Downloads) != 2 || gameResp.Game.Downloads[1].Code == nil {
		t.Fatalf("expected RO1 code emitted on download entry, got %+v", gameResp.Game.Downloads)
	}
	code := *gameResp.Game.Downloads[1].Code

	// 2. Instant decode GET /api/roms/:code
	decReq := httptest.NewRequest(http.MethodGet, "/api/roms/"+code, nil)
	decReq.Host = "127.0.0.1:5000"
	decRec := httptest.NewRecorder()
	router.ServeHTTP(decRec, decReq)
	if decRec.Code != http.StatusOK {
		t.Fatalf("expected 200 from decode, got %d body=%s", decRec.Code, decRec.Body.String())
	}
	var ref domain.RomRef
	_ = json.Unmarshal(decRec.Body.Bytes(), &ref)
	if ref.Source != "romsfun" || ref.FileIndex != 1 || ref.GameURL != "https://romsfun.com/roms/game-boy-advance/pokemon-fire-red.html" {
		t.Fatalf("unexpected decoded ref: %+v", ref)
	}

	// 3. Resolved details GET /api/roms/:code?resolve=1
	resReq := httptest.NewRequest(http.MethodGet, "/api/roms/"+code+"?resolve=1", nil)
	resReq.Host = "127.0.0.1:5000"
	resRec := httptest.NewRecorder()
	router.ServeHTTP(resRec, resReq)
	if resRec.Code != http.StatusOK {
		t.Fatalf("expected 200 from resolve, got %d body=%s", resRec.Code, resRec.Body.String())
	}
	var resolved domain.ResolvedRomResponse
	_ = json.Unmarshal(resRec.Body.Bytes(), &resolved)
	if resolved.FileIndex != 1 || resolved.File.DownloadURL == nil || *resolved.File.DownloadURL != dl1 {
		t.Fatalf("unexpected resolved file: %+v", resolved)
	}

	// 4. Direct download stream GET /api/roms/:code/download
	dlReq := httptest.NewRequest(http.MethodGet, "/api/roms/"+code+"/download", nil)
	dlReq.Host = "127.0.0.1:5000"
	dlRec := httptest.NewRecorder()
	router.ServeHTTP(dlRec, dlReq)
	if dlRec.Code != http.StatusOK || dlRec.Body.String() != "ROMDATA" {
		t.Fatalf("unexpected ROM code download response: code=%d body=%q", dlRec.Code, dlRec.Body.String())
	}
}

func TestImageProxyEndpoint_GuardsAndStreams(t *testing.T) {
	opener := stubOpener(func(_ context.Context, target string, _ ports.OpenPinnedOptions) (io.ReadCloser, int, http.Header, error) {
		if strings.HasSuffix(target, ".svg") {
			return io.NopCloser(strings.NewReader("<svg></svg>")), 200, http.Header{"Content-Type": []string{"image/svg+xml"}}, nil
		}
		return io.NopCloser(strings.NewReader("PNGDATA")), 200, http.Header{"Content-Type": []string{"image/png"}}, nil
	})
	router := buildTestRouter(t, nil, realCatalogPath(t), opener, nil, "")

	missing := httptest.NewRequest(http.MethodGet, "/api/image", nil)
	missing.Host = "127.0.0.1:5000"
	recMissing := httptest.NewRecorder()
	router.ServeHTTP(recMissing, missing)
	if recMissing.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on missing url, got %d", recMissing.Code)
	}

	svgReq := httptest.NewRequest(http.MethodGet, "/api/image?url=https://romsfun.com/cover.svg", nil)
	svgReq.Host = "127.0.0.1:5000"
	recSVG := httptest.NewRecorder()
	router.ServeHTTP(recSVG, svgReq)
	if recSVG.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 rejecting image/svg+xml, got %d", recSVG.Code)
	}

	okReq := httptest.NewRequest(http.MethodGet, "/api/image?url=https://romsfun.com/cover.png", nil)
	okReq.Host = "127.0.0.1:5000"
	recOK := httptest.NewRecorder()
	router.ServeHTTP(recOK, okReq)
	if recOK.Code != http.StatusOK || recOK.Body.String() != "PNGDATA" || recOK.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("unexpected image proxy response: code=%d body=%q headers=%v", recOK.Code, recOK.Body.String(), recOK.Header())
	}
}

func strPtr(s string) *string { return &s }

type progressiveStubProvider struct {
	stubProvider
	streamFn func(ctx context.Context, url string, emit func(domain.GameDetails)) (domain.GameDetails, error)
}

func (p progressiveStubProvider) DetailsStream(
	ctx context.Context,
	url string,
	emit func(domain.GameDetails),
) (domain.GameDetails, error) {
	return p.streamFn(ctx, url, emit)
}

func TestGameEndpoint_StreamsSSEAndPreservesJSON(t *testing.T) {
	reg := providers.NewRegistry(progressiveStubProvider{
		stubProvider: stubProvider{
			id: "romsfun", label: "RomsFun", domain: "romsfun.com",
			detailsFn: func(_ context.Context, _ string) (domain.GameDetails, error) {
				return domain.GameDetails{Name: strPtr("Metroid")}, nil
			},
		},
		streamFn: func(_ context.Context, _ string, emit func(domain.GameDetails)) (domain.GameDetails, error) {
			d := domain.GameDetails{Name: strPtr("Metroid")}
			if emit != nil {
				emit(d)
			}
			d.Downloads = []domain.DownloadDetails{{
				Filename:    strPtr("metroid.zip"),
				DownloadURL: strPtr("https://files.romsfun.com/metroid.zip"),
			}}
			if emit != nil {
				emit(d)
			}
			return d, nil
		},
	})
	router := buildTestRouter(t, reg, realCatalogPath(t), nil, nil, "")

	target := "/api/game?source=romsfun&url=https://romsfun.com/roms/gba/metroid.html"

	sseReq := httptest.NewRequest(http.MethodGet, target, nil)
	sseReq.Host = "127.0.0.1:5000"
	sseReq.Header.Set("Accept", "text/event-stream, application/json")
	sseRec := httptest.NewRecorder()
	router.ServeHTTP(sseRec, sseReq)
	if sseRec.Code != http.StatusOK {
		t.Fatalf("expected 200 SSE response, got %d body=%s", sseRec.Code, sseRec.Body.String())
	}
	if !strings.Contains(sseRec.Header().Get("Content-Type"), "text/event-stream") {
		t.Fatalf("expected text/event-stream content type, got %q", sseRec.Header().Get("Content-Type"))
	}
	body := sseRec.Body.String()
	for _, want := range []string{"event: details\n", "event: downloads\n", "event: done\n", `"metroid.zip"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("expected SSE body to contain %q, got:\n%s", want, body)
		}
	}

	jsonReq := httptest.NewRequest(http.MethodGet, target, nil)
	jsonReq.Host = "127.0.0.1:5000"
	jsonReq.Header.Set("Accept", "application/json")
	jsonRec := httptest.NewRecorder()
	router.ServeHTTP(jsonRec, jsonReq)
	if jsonRec.Code != http.StatusOK || !strings.Contains(jsonRec.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("expected JSON fallback response, got code=%d ct=%q", jsonRec.Code, jsonRec.Header().Get("Content-Type"))
	}
	var parsed domain.GameResponse
	if err := json.Unmarshal(jsonRec.Body.Bytes(), &parsed); err != nil || parsed.Game.Name == nil || *parsed.Game.Name != "Metroid" {
		t.Fatalf("unexpected JSON game payload: err=%v parsed=%+v", err, parsed)
	}
}

func TestGameEndpoint_ProbeRejects403AndKeeps200(t *testing.T) {
	okURL := "https://cdn.romsfun.com/ok.zip"
	badURL := "https://cdn.romsfun.com/forbidden.zip"
	reg := providers.NewRegistry(stubProvider{
		id: "romsfun", label: "RomsFun", domain: "romsfun.com",
		detailsFn: func(_ context.Context, _ string) (domain.GameDetails, error) {
			return domain.GameDetails{
				Name: strPtr("Castlevania"),
				Downloads: []domain.DownloadDetails{
					{Filename: strPtr("ok.zip"), DownloadURL: &okURL},
					{Filename: strPtr("forbidden.zip"), DownloadURL: &badURL},
				},
			}, nil
		},
	})
	opener := stubOpener(func(_ context.Context, target string, _ ports.OpenPinnedOptions) (io.ReadCloser, int, http.Header, error) {
		if target == badURL {
			return nil, 0, nil, domain.BadGateway("O servidor remoto recusou o download (HTTP 403).", nil)
		}
		return io.NopCloser(strings.NewReader("")), http.StatusOK, http.Header{}, nil
	})
	router := buildTestRouter(t, reg, realCatalogPath(t), opener, nil, "")

	req := httptest.NewRequest(http.MethodGet, "/api/game?source=romsfun&url=https://romsfun.com/roms/gba/castlevania.html", nil)
	req.Host = "127.0.0.1:5000"
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	var resp domain.GameResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(resp.Game.Downloads) != 2 {
		t.Fatalf("expected 2 downloads, got %+v", resp.Game.Downloads)
	}
	if resp.Game.Downloads[0].DownloadURL == nil || resp.Game.Downloads[0].Code == nil {
		t.Fatalf("expected ok download to stay available with code, got %+v", resp.Game.Downloads[0])
	}
	if resp.Game.Downloads[1].DownloadURL != nil || resp.Game.Downloads[1].Code != nil {
		t.Fatalf("expected 403 download to become unavailable, got %+v", resp.Game.Downloads[1])
	}
}
