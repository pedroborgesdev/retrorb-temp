package session

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	api2captcha "github.com/2captcha/2captcha-go"
)

type captchaSolverFunc func(api2captcha.Request) (string, string, error)

func (f captchaSolverFunc) Solve(req api2captcha.Request) (string, string, error) {
	return f(req)
}

type observableCancelContext struct {
	context.Context
	done        chan struct{}
	observed    chan struct{}
	observeOnce sync.Once
}

func (c *observableCancelContext) Done() <-chan struct{} {
	c.observeOnce.Do(func() { close(c.observed) })
	return c.done
}

func (c *observableCancelContext) Err() error {
	select {
	case <-c.done:
		return context.Canceled
	default:
		return nil
	}
}

func TestSolveTurnstileMapsStandaloneRequestAndSessionUserAgent(t *testing.T) {
	session, err := NewSessionClient(Config{
		UserAgent: "Retrorb/1.0",
		TwoCaptcha: TwoCaptchaConfig{
			APIKey: "secret-key",
		},
	})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	session.captchaSolver = captchaSolverFunc(func(req api2captcha.Request) (string, string, error) {
		want := map[string]string{
			"method":    "turnstile",
			"sitekey":   "site-key",
			"pageurl":   "https://example.com/protected",
			"userAgent": "Retrorb/1.0",
		}
		if len(req.Params) != len(want) {
			t.Fatalf("Turnstile params = %v, want exactly %v", req.Params, want)
		}
		for key, value := range want {
			if req.Params[key] != value {
				t.Fatalf("Turnstile param %q = %q, want %q", key, req.Params[key], value)
			}
		}
		return "turnstile-token", "captcha-123", nil
	})

	result, err := session.SolveTurnstile(context.Background(), TurnstileRequest{
		SiteKey: "site-key",
		URL:     "https://example.com/protected",
	})
	if err != nil {
		t.Fatalf("SolveTurnstile() error = %v", err)
	}
	if result.Token != "turnstile-token" || result.CaptchaID != "captcha-123" {
		t.Fatalf("SolveTurnstile() = %+v, want token and captcha ID", result)
	}
}

func TestSolveTurnstileMapsChallengeFieldsAndUserAgentOverride(t *testing.T) {
	session, err := NewSessionClient(Config{
		UserAgent:  "Retrorb/1.0",
		TwoCaptcha: TwoCaptchaConfig{APIKey: "secret-key"},
	})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	session.captchaSolver = captchaSolverFunc(func(req api2captcha.Request) (string, string, error) {
		want := map[string]string{
			"method":    "turnstile",
			"sitekey":   "challenge-key",
			"pageurl":   "https://example.com/challenge",
			"data":      "cdata-value",
			"pagedata":  "page-data-value",
			"action":    "managed",
			"userAgent": "ChallengeBrowser/2.0",
		}
		if len(req.Params) != len(want) {
			t.Fatalf("Turnstile params = %v, want exactly %v", req.Params, want)
		}
		for key, value := range want {
			if req.Params[key] != value {
				t.Fatalf("Turnstile param %q = %q, want %q", key, req.Params[key], value)
			}
		}
		return "challenge-token", "captcha-456", nil
	})

	result, err := session.SolveTurnstile(context.Background(), TurnstileRequest{
		SiteKey:   "challenge-key",
		URL:       "https://example.com/challenge",
		Data:      "cdata-value",
		PageData:  "page-data-value",
		Action:    "managed",
		UserAgent: "ChallengeBrowser/2.0",
	})
	if err != nil {
		t.Fatalf("SolveTurnstile() error = %v", err)
	}
	if result.Token != "challenge-token" || result.CaptchaID != "captcha-456" {
		t.Fatalf("SolveTurnstile() = %+v, want challenge result", result)
	}
}

func TestSolveTurnstileRejectsMissingConfigurationAndInvalidInput(t *testing.T) {
	withoutKey, err := NewSessionClient(Config{})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	_, err = withoutKey.SolveTurnstile(context.Background(), TurnstileRequest{
		SiteKey: "site-key",
		URL:     "https://example.com",
	})
	if !errors.Is(err, ErrTwoCaptchaNotConfigured) {
		t.Fatalf("SolveTurnstile() without key error = %v, want ErrTwoCaptchaNotConfigured", err)
	}

	withKey, err := NewSessionClient(Config{TwoCaptcha: TwoCaptchaConfig{APIKey: "secret-key"}})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	for _, request := range []TurnstileRequest{
		{},
		{SiteKey: "site-key"},
		{SiteKey: "site-key", URL: "/relative"},
		{SiteKey: "site-key", URL: "ftp://example.com/challenge"},
	} {
		if _, err := withKey.SolveTurnstile(context.Background(), request); !errors.Is(err, ErrInvalidTurnstileRequest) {
			t.Errorf("SolveTurnstile(%+v) error = %v, want ErrInvalidTurnstileRequest", request, err)
		}
	}
}

func TestSolveTurnstileWrapsSolverError(t *testing.T) {
	upstreamErr := errors.New("upstream unavailable")
	session, err := NewSessionClient(Config{TwoCaptcha: TwoCaptchaConfig{APIKey: "secret-key"}})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	session.captchaSolver = captchaSolverFunc(func(api2captcha.Request) (string, string, error) {
		return "", "", upstreamErr
	})

	_, err = session.SolveTurnstile(context.Background(), TurnstileRequest{
		SiteKey: "site-key",
		URL:     "https://example.com",
	})
	if !errors.Is(err, upstreamErr) {
		t.Fatalf("SolveTurnstile() error = %v, want wrapped upstream error", err)
	}
}

func TestSolveTurnstileReturnsPromptlyWhenContextIsCanceled(t *testing.T) {
	release := make(chan struct{})
	session, err := NewSessionClient(Config{TwoCaptcha: TwoCaptchaConfig{APIKey: "secret-key"}})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	session.captchaSolver = captchaSolverFunc(func(api2captcha.Request) (string, string, error) {
		<-release
		return "late-token", "late-id", nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	_, err = session.SolveTurnstile(ctx, TurnstileRequest{
		SiteKey: "site-key",
		URL:     "https://example.com",
	})
	close(release)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("SolveTurnstile() error = %v, want context.Canceled", err)
	}
	if elapsed := time.Since(start); elapsed > 100*time.Millisecond {
		t.Fatalf("SolveTurnstile() cancellation took %s, want under 100ms", elapsed)
	}
}

func TestSolveTurnstileDoesNotSubmitQueuedTaskAfterCancellation(t *testing.T) {
	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	secondSubmitted := make(chan struct{})
	calls := 0

	session, err := NewSessionClient(Config{TwoCaptcha: TwoCaptchaConfig{APIKey: "secret-key"}})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	session.captchaSolver = captchaSolverFunc(func(api2captcha.Request) (string, string, error) {
		calls++
		if calls == 1 {
			close(firstStarted)
			<-releaseFirst
			return "first-token", "first-id", nil
		}
		close(secondSubmitted)
		return "second-token", "second-id", nil
	})

	firstResult := make(chan error, 1)
	go func() {
		_, solveErr := session.SolveTurnstile(context.Background(), TurnstileRequest{
			SiteKey: "site-key",
			URL:     "https://example.com/first",
		})
		firstResult <- solveErr
	}()
	select {
	case <-firstStarted:
	case <-time.After(time.Second):
		t.Fatal("first solver call did not start")
	}

	secondCtx := &observableCancelContext{
		Context:  context.Background(),
		done:     make(chan struct{}),
		observed: make(chan struct{}),
	}
	secondResult := make(chan error, 1)
	go func() {
		_, solveErr := session.SolveTurnstile(secondCtx, TurnstileRequest{
			SiteKey: "site-key",
			URL:     "https://example.com/second",
		})
		secondResult <- solveErr
	}()
	select {
	case <-secondCtx.observed:
	case <-time.After(time.Second):
		t.Fatal("second call did not begin waiting")
	}
	close(secondCtx.done)
	if err := <-secondResult; !errors.Is(err, context.Canceled) {
		t.Fatalf("second SolveTurnstile() error = %v, want context.Canceled", err)
	}

	close(releaseFirst)
	if err := <-firstResult; err != nil {
		t.Fatalf("first SolveTurnstile() error = %v", err)
	}
	select {
	case <-secondSubmitted:
		t.Fatal("canceled queued Turnstile task was submitted to 2Captcha")
	case <-time.After(100 * time.Millisecond):
	}
}

func TestDetectTurnstileSiteKey(t *testing.T) {
	tests := []struct {
		name     string
		pageHTML string
		want     string
		wantErr  bool
	}{
		{
			name:     "implicit widget",
			pageHTML: `<div class="content cf-turnstile" data-sitekey="  0x4AAAAAAImplicit  "></div>`,
			want:     "0x4AAAAAAImplicit",
		},
		{
			name:     "explicit rendering",
			pageHTML: `<script>window.turnstile.render('#widget', { sitekey: '0x4AAAAAAExplicit' });</script>`,
			want:     "0x4AAAAAAExplicit",
		},
		{
			name:     "explicit rendering with quoted property",
			pageHTML: `<script>turnstile.render('#widget', { "sitekey": "0x4AAAAAAQuoted" });</script>`,
			want:     "0x4AAAAAAQuoted",
		},
		{
			name:     "unrelated data attribute",
			pageHTML: `<div class="other-widget" data-sitekey="not-turnstile"></div>`,
			wantErr:  true,
		},
		{
			name:     "unrelated script property",
			pageHTML: `<script>window.otherWidget = { sitekey: 'not-turnstile' };</script>`,
			wantErr:  true,
		},
		{
			name:     "Turnstile render property is not a call",
			pageHTML: `<script>turnstile.render = function() {}; window.otherWidget = { sitekey: 'not-turnstile' };</script>`,
			wantErr:  true,
		},
		{
			name:     "empty sitekey",
			pageHTML: `<div class="cf-turnstile" data-sitekey="   "></div>`,
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := detectTurnstileSiteKey(tt.pageHTML)
			if tt.wantErr {
				if !errors.Is(err, ErrTurnstileSiteKeyNotFound) {
					t.Fatalf("detectTurnstileSiteKey() error = %v, want ErrTurnstileSiteKeyNotFound", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("detectTurnstileSiteKey() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("detectTurnstileSiteKey() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSolveTurnstileAutoDetectsSiteKeyUsingSessionAndFinalURL(t *testing.T) {
	const userAgent = "Retrorb/1.0"
	handlerErrors := make(chan string, 4)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.UserAgent() != userAgent {
			handlerErrors <- "unexpected User-Agent: " + r.UserAgent()
		}
		switch r.URL.Path {
		case "/start":
			http.SetCookie(w, &http.Cookie{Name: "challenge", Value: "present", Path: "/"})
			http.Redirect(w, r, "/final", http.StatusFound)
		case "/final":
			if _, err := r.Cookie("challenge"); err != nil {
				handlerErrors <- "session cookie was not preserved across redirect"
			}
			_, _ = w.Write([]byte(`<div class="cf-turnstile" data-sitekey="detected-site-key"></div>`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	session, err := NewSessionClient(Config{
		UserAgent:  userAgent,
		TwoCaptcha: TwoCaptchaConfig{APIKey: "secret-key"},
	})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	submitted := make(chan api2captcha.Request, 1)
	session.captchaSolver = captchaSolverFunc(func(req api2captcha.Request) (string, string, error) {
		submitted <- req
		return "auto-token", "auto-id", nil
	})

	result, err := session.SolveTurnstile(context.Background(), TurnstileRequest{
		URL: server.URL + "/start",
	})
	if err != nil {
		t.Fatalf("SolveTurnstile() error = %v", err)
	}
	if result.Token != "auto-token" || result.CaptchaID != "auto-id" {
		t.Fatalf("SolveTurnstile() = %+v, want automatic solve result", result)
	}

	request := <-submitted
	if got := request.Params["sitekey"]; got != "detected-site-key" {
		t.Fatalf("submitted sitekey = %q, want %q", got, "detected-site-key")
	}
	if got := request.Params["pageurl"]; got != server.URL+"/final" {
		t.Fatalf("submitted pageurl = %q, want final URL %q", got, server.URL+"/final")
	}
	if got := request.Params["userAgent"]; got != userAgent {
		t.Fatalf("submitted userAgent = %q, want %q", got, userAgent)
	}
	close(handlerErrors)
	for handlerErr := range handlerErrors {
		t.Error(handlerErr)
	}
}

func TestSolveTurnstileAutoChecksRedirectBeforeFetchingNextPage(t *testing.T) {
	redirectErr := errors.New("Turnstile redirect blocked")
	receivedByOtherHost := make(chan struct{}, 1)

	otherHost := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		receivedByOtherHost <- struct{}{}
		_, _ = w.Write([]byte(`<div class="cf-turnstile" data-sitekey="stolen-site-key"></div>`))
	}))
	defer otherHost.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, otherHost.URL+"/challenge", http.StatusFound)
	}))
	defer server.Close()

	session, err := NewSessionClient(Config{TwoCaptcha: TwoCaptchaConfig{APIKey: "secret-key"}})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	submitted := make(chan struct{}, 1)
	session.captchaSolver = captchaSolverFunc(func(api2captcha.Request) (string, string, error) {
		submitted <- struct{}{}
		return "unexpected-token", "unexpected-id", nil
	})

	_, err = session.SolveTurnstile(context.Background(), TurnstileRequest{
		URL: server.URL,
		RedirectCheck: func(next *http.Request, _ []*http.Request) error {
			if next.URL.Host != strings.TrimPrefix(server.URL, "http://") {
				return redirectErr
			}
			return nil
		},
	})
	if !errors.Is(err, redirectErr) {
		t.Fatalf("SolveTurnstile() error = %v, want redirectErr", err)
	}
	select {
	case <-receivedByOtherHost:
		t.Fatal("blocked redirect fetched a Turnstile page from another host")
	default:
	}
	select {
	case <-submitted:
		t.Fatal("blocked redirect was submitted to 2Captcha")
	default:
	}
}

func TestSolveTurnstileAutoDoesNotSubmitWhenSiteKeyIsMissing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<html><body>no Turnstile widget</body></html>`))
	}))
	defer server.Close()

	session, err := NewSessionClient(Config{TwoCaptcha: TwoCaptchaConfig{APIKey: "secret-key"}})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	submitted := make(chan struct{}, 1)
	session.captchaSolver = captchaSolverFunc(func(api2captcha.Request) (string, string, error) {
		submitted <- struct{}{}
		return "unexpected-token", "unexpected-id", nil
	})

	_, err = session.SolveTurnstile(context.Background(), TurnstileRequest{URL: server.URL})
	if !errors.Is(err, ErrTurnstileSiteKeyNotFound) {
		t.Fatalf("SolveTurnstile() error = %v, want ErrTurnstileSiteKeyNotFound", err)
	}
	select {
	case <-submitted:
		t.Fatal("page without a sitekey was submitted to 2Captcha")
	default:
	}
}
