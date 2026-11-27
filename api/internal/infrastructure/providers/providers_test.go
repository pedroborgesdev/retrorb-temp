package providers_test

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"retromancy/api/internal/infrastructure/providers"
	"retromancy/api/internal/infrastructure/providers/romsfun"
	"retromancy/api/internal/infrastructure/providers/romsgames"
	"retromancy/api/internal/infrastructure/providers/romspure"
	"retromancy/api/internal/infrastructure/providers/wowroms"
	"retromancy/api/internal/ports"
)

type mockDoer func(*http.Request) (*http.Response, error)

func (f mockDoer) Do(req *http.Request) (*http.Response, error) { return f(req) }

func htmlResp(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"text/html"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestRomsFunProvider_SearchAndDetails(t *testing.T) {
	factory := func(_ time.Duration) ports.HTTPDoer {
		return mockDoer(func(req *http.Request) (*http.Response, error) {
			u := req.URL.String()
			switch {
			case strings.Contains(u, "/browse-all-roms/"):
				return htmlResp(200, `
					<div class="rf-li">
						<img src="/covers/firered.png" />
						<h3 class="rf-li-title"><a href="/roms/game-boy-advance/pokemon-firered.html">Pokemon FireRed</a></h3>
						<div class="rf-li-stats-m"><span>12,345</span><span>16.4 MB</span></div>
					</div>
					<a aria-label="next" href="/browse-all-roms/page/2/">Next</a>
				`), nil
			case strings.Contains(u, "admin-ajax.php"):
				return htmlResp(200, `{"success":true,"data":{"download_url":"https://cdn.romsfun.com/firered.zip"}}`), nil
			case strings.Contains(u, "/download/pokemon-firered/1"):
				return htmlResp(200, `<div id="download-container" data-ajax-url="https://romsfun.com/wp-admin/admin-ajax.php"><a id="download-link" href="https://cdn.romsfun.com/fallback.zip">Go</a></div>`), nil
			case strings.Contains(u, "/download/pokemon-firered"):
				return htmlResp(200, `<h2>Normal download links</h2><table><tbody><tr><td><a href="/download/pokemon-firered/1">FireRed USA</a></td><td>ZIP</td><td>16.4 MB</td></tr></tbody></table>`), nil
			default:
				return htmlResp(200, `
					<h1>Pokemon FireRed</h1>
					<img class="rf-hero-thumb" src="/thumb.png" />
					<div data-rateyo-rating="4.8"></div>(1,230 reviews)
					<table>
						<tr><td>Release Date</td><td>2004</td></tr>
						<tr><td>Publisher</td><td>Nintendo</td></tr>
						<tr><td>Region</td><td><span class="rf-fl-n">USA</span></td></tr>
					</table>
					<div class="revert page-content"><p>Explore Kanto.</p></div>
					<div id="romGallery"><img data-src="/shot1.jpg" /></div>
					<a href="/download/pokemon-firered">Download ROM</a>
				`), nil
			}
		})
	}

	p := romsfun.NewProvider(factory)
	page, err := p.Search(context.Background(), "pokemon", 1)
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}
	if !page.HasNext || len(page.Results) != 1 {
		t.Fatalf("unexpected search page: %+v", page)
	}
	item := page.Results[0]
	if item.Title == nil || *item.Title != "Pokemon FireRed" || item.Console == nil || *item.Console != "Game Boy Advance" || item.Downloads == nil || *item.Downloads != 12345 {
		t.Fatalf("unexpected parsed result: %+v", item)
	}

	details, err := p.Details(context.Background(), "https://romsfun.com/roms/game-boy-advance/pokemon-firered.html")
	if err != nil {
		t.Fatalf("Details failed: %v", err)
	}
	if details.Name == nil || *details.Name != "Pokemon FireRed" || len(details.Downloads) != 1 || *details.Downloads[0].DownloadURL != "https://cdn.romsfun.com/firered.zip" {
		t.Fatalf("unexpected game details: %+v", details)
	}
}

func TestRomsPureProvider_SearchAndDetails(t *testing.T) {
	factory := func(_ time.Duration) ports.HTTPDoer {
		return mockDoer(func(req *http.Request) (*http.Response, error) {
			u := req.URL.String()
			switch {
			case strings.Contains(u, "/browse-roms/"):
				return htmlResp(200, `
					<article class="rom-item">
						<a href="/roms/playstation-2/black-100/"></a>
						<h3>Black</h3>
						<img src="/black.jpg" />
						<span class="text-brand-muted truncate">PS2</span>
						<span class="min-w-[24px]">1.8 GB</span>
					</article>
				`), nil
			case strings.Contains(u, "admin-ajax.php"):
				_ = req.ParseForm()
				if req.Form.Get("action") == "romspure_get_nonce" {
					return htmlResp(200, `{"success":true,"data":{"nonce":"n123"}}`), nil
				}
				return htmlResp(200, `{"success":true,"data":{"url":"https://cdn.romspure.cc/black.iso"}}`), nil
			case strings.Contains(u, "/download/black-100"):
				return htmlResp(200, `<a href="/download/black-100/0"><div class="break-words">Black (USA)</div><div class="truncate">ISO</div><div class="font-semibold shrink-0">1.8 GB</div></a>`), nil
			default:
				return htmlResp(200, `
					<h1>Black</h1>
					<script type="application/ld+json">{"@type":"VideoGame","interactionStatistic":{"interactionType":"DownloadAction","userInteractionCount":"98,765"}}</script>
					<div class="rs-info__tile"><span class="rs-info__k">Publisher</span><span class="rs-info__v">EA</span></div>
					<a href="/download/black-100/">Download</a>
				`), nil
			}
		})
	}

	p := romspure.NewProvider(factory)
	page, err := p.Search(context.Background(), "black", 1)
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}
	if len(page.Results) != 1 || page.Results[0].Downloads == nil || *page.Results[0].Downloads != 98765 {
		t.Fatalf("expected enriched download count, got %+v", page)
	}

	details, err := p.Details(context.Background(), "https://romspure.cc/roms/playstation-2/black-100/")
	if err != nil {
		t.Fatalf("Details failed: %v", err)
	}
	if len(details.Downloads) != 1 || *details.Downloads[0].DownloadURL != "https://cdn.romspure.cc/black.iso" {
		t.Fatalf("unexpected RomsPure downloads: %+v", details.Downloads)
	}
}

func TestRomsGamesProvider_SearchAndDetails(t *testing.T) {
	factory := func(_ time.Duration) ports.HTTPDoer {
		return mockDoer(func(req *http.Request) (*http.Response, error) {
			u := req.URL.String()
			switch {
			case strings.Contains(u, "/search/"):
				return htmlResp(200, `<a class="shadow-lg" href="/gameboy-advance-rom-metroid/"><img alt="Metroid Fusion" src="/metroid.jpg"></a>`), nil
			case strings.Contains(u, "?download"):
				return htmlResp(200, `{"downloadName":"Metroid%20Fusion.zip","downloadUrl":"https://cdn.romsgames.net/metroid.zip","media":{"size":4194304,"MediaResources":[{"mimeType":"application/zip"}]}}`), nil
			default:
				return htmlResp(200, `
					<h1>Metroid Fusion</h1>
					<script type="application/ld+json">{"@type":"VideoGame","gamePlatform":"Game Boy Advance","fileSize":"4 MB","description":"Action & exploration"}</script>
					<div data-media-id="42"></div>
				`), nil
			}
		})
	}

	p := romsgames.NewProvider(factory)
	page2, err := p.Search(context.Background(), "metroid", 2)
	if err != nil || len(page2.Results) != 0 || page2.HasNext {
		t.Fatalf("expected empty page 2 for romsgames, got %+v err=%v", page2, err)
	}

	details, err := p.Details(context.Background(), "https://www.romsgames.net/gameboy-advance-rom-metroid/")
	if err != nil {
		t.Fatalf("Details failed: %v", err)
	}
	if len(details.Downloads) != 1 || *details.Downloads[0].Filename != "Metroid Fusion.zip" || *details.Downloads[0].Size != "4.19 MB" {
		t.Fatalf("unexpected RomsGames downloads: %+v", details.Downloads)
	}
}

func TestWowRomsProvider_SearchDetailsAndResolveDownload(t *testing.T) {
	factory := func(_ time.Duration) ports.HTTPDoer {
		return mockDoer(func(req *http.Request) (*http.Response, error) {
			u := req.URL.String()
			switch {
			case strings.Contains(u, "/en/roms/list"):
				return htmlResp(200, `
					<li class="element"><a class="title-5" title="Pokemon Red" href="/en/roms/gameboy/pokemon-red/1.html">Pokemon Red</a><a class="colorRed">Game Boy</a></li>
					<li class="next"><a href="?search=pokemon&amp;page=2">Next</a></li>
				`), nil
			case strings.Contains(u, "ajax-dl"):
				return htmlResp(200, `{"s":true,"link":"https://dl.wowroms.com/pokemon-red.zip"}`), nil
			default:
				return htmlResp(200, `
					<h1 id="page-product-title">Pokemon Red</h1>
					<meta name="description" content="Classic RPG" />
					<li><span>File Name:</span><b>Pokemon Red (USA)</b></li>
					<li><span>File Size:</span><b>512 KB</b></li>
					<script>var ajaxLinkUrl = "https://wowroms.com/ajax-dl";</script>
					<form id="submitForm"><input type="hidden" name="token" value="xyz" /></form>
				`), nil
			}
		})
	}

	p := wowroms.NewProvider(factory)
	var _ ports.CustomDownloadResolver = p

	resolved, err := p.ResolveDownload(context.Background(), "https://wowroms.com/en/roms/gameboy/pokemon-red/1.html", 0, nil)
	if err != nil {
		t.Fatalf("ResolveDownload failed: %v", err)
	}
	if resolved.Method != "POST" || resolved.FormData["token"] != "xyz" || resolved.Filename != "Pokemon Red (USA).zip" {
		t.Fatalf("unexpected resolved WowRoms download: %+v", resolved)
	}

	wrongName := "Other.zip"
	if _, err := p.ResolveDownload(context.Background(), "https://wowroms.com/en/roms/gameboy/pokemon-red/1.html", 0, &wrongName); err == nil {
		t.Fatal("expected 409 conflict on filename mismatch")
	}
	_ = providers.BrowserUserAgent
}
