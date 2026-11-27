package session

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type repeatingReader byte

func (r repeatingReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = byte(r)
	}
	return len(p), nil
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestNewSessionClientAppliesDefaults(t *testing.T) {
	session, err := NewSessionClient(Config{})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}

	if session.config.Timeout != 60*time.Second {
		t.Fatalf("default timeout = %s, want 1m0s", session.config.Timeout)
	}
	if session.config.MaxRedirects != 10 {
		t.Fatalf("default redirect limit = %d, want 10", session.config.MaxRedirects)
	}
}

func TestSessionClientGetPreservesCookiesAndResponseMetadata(t *testing.T) {
	const userAgent = "Retrorb/1.0"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/start":
			http.SetCookie(w, &http.Cookie{Name: "session_id", Value: "abc123", Path: "/"})
			http.Redirect(w, r, "/final", http.StatusFound)
		case "/final":
			cookie, err := r.Cookie("session_id")
			if err != nil || cookie.Value != "abc123" {
				t.Errorf("redirected request cookie = %v, error = %v", cookie, err)
			}
			if got := r.Header.Get("User-Agent"); got != userAgent {
				t.Errorf("User-Agent = %q, want %q", got, userAgent)
			}
			w.Header().Set("X-Upstream", "retromancy")
			_, _ = io.WriteString(w, "<html>ok</html>")
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	session, err := NewSessionClient(Config{
		Timeout:      2 * time.Second,
		UserAgent:    userAgent,
		MaxRedirects: 3,
	})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}

	result, err := session.Get(context.Background(), server.URL+"/start")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if result.StatusCode != http.StatusOK {
		t.Fatalf("StatusCode = %d, want 200", result.StatusCode)
	}
	if result.URL != server.URL+"/final" {
		t.Fatalf("URL = %q, want %q", result.URL, server.URL+"/final")
	}
	if result.HTML != "<html>ok</html>" {
		t.Fatalf("HTML = %q, want response body", result.HTML)
	}
	if result.Headers.Get("X-Upstream") != "retromancy" {
		t.Fatalf("response headers = %v, want cloned upstream header", result.Headers)
	}
	if result.Duration <= 0 {
		t.Fatalf("Duration = %s, want positive duration", result.Duration)
	}
	if len(result.Cookies) != 1 || result.Cookies[0].Name != "session_id" || result.Cookies[0].Value != "abc123" {
		t.Fatalf("Cookies = %v, want session_id=abc123", result.Cookies)
	}

	cookies, err := session.GetCookies(server.URL)
	if err != nil {
		t.Fatalf("GetCookies() error = %v", err)
	}
	if len(cookies) != 1 || cookies[0].Name != "session_id" {
		t.Fatalf("GetCookies() = %v, want stored session cookie", cookies)
	}

	if err := session.ClearCookies(); err != nil {
		t.Fatalf("ClearCookies() error = %v", err)
	}
	cookies, err = session.GetCookies(server.URL)
	if err != nil {
		t.Fatalf("GetCookies() after clear error = %v", err)
	}
	if len(cookies) != 0 {
		t.Fatalf("GetCookies() after clear = %v, want no cookies", cookies)
	}
}

func TestSessionClientDoUsesSessionForPostAndFollowsSeeOtherAsGet(t *testing.T) {
	const userAgent = "Retrorb/1.0"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/seed":
			http.SetCookie(w, &http.Cookie{Name: "challenge", Value: "pending", Path: "/"})
			w.WriteHeader(http.StatusNoContent)
		case "/submit":
			if r.Method != http.MethodPost {
				t.Errorf("submit method = %q, want POST", r.Method)
			}
			if got := r.Header.Get("Content-Type"); got != "application/x-www-form-urlencoded" {
				t.Errorf("submit Content-Type = %q, want form encoding", got)
			}
			if got := r.UserAgent(); got != userAgent {
				t.Errorf("submit User-Agent = %q, want %q", got, userAgent)
			}
			if cookie, err := r.Cookie("challenge"); err != nil || cookie.Value != "pending" {
				t.Errorf("submit cookie = %v, error = %v, want challenge=pending", cookie, err)
			}
			if err := r.ParseForm(); err != nil {
				t.Errorf("ParseForm() error = %v", err)
			}
			if got := r.Form.Get("answer"); got != "solved-token" {
				t.Errorf("answer = %q, want solved-token", got)
			}
			http.SetCookie(w, &http.Cookie{Name: "challenge", Value: "accepted", Path: "/"})
			http.Redirect(w, r, "/final", http.StatusSeeOther)
		case "/final":
			if r.Method != http.MethodGet {
				t.Errorf("redirected method = %q, want GET", r.Method)
			}
			if cookie, err := r.Cookie("challenge"); err != nil || cookie.Value != "accepted" {
				t.Errorf("redirected cookie = %v, error = %v, want challenge=accepted", cookie, err)
			}
			w.Header().Set("X-Upstream", "vimm-like")
			_, _ = io.WriteString(w, "resolved page")
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	session, err := NewSessionClient(Config{UserAgent: userAgent})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	if _, err := session.Get(context.Background(), server.URL+"/seed"); err != nil {
		t.Fatalf("seed Get() error = %v", err)
	}

	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		server.URL+"/submit",
		strings.NewReader("answer=solved-token"),
	)
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	result, err := session.Do(req)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	if result.StatusCode != http.StatusOK {
		t.Fatalf("StatusCode = %d, want 200", result.StatusCode)
	}
	if result.URL != server.URL+"/final" {
		t.Fatalf("URL = %q, want final redirect URL", result.URL)
	}
	if result.HTML != "resolved page" {
		t.Fatalf("HTML = %q, want resolved page", result.HTML)
	}
	if result.Headers.Get("X-Upstream") != "vimm-like" {
		t.Fatalf("X-Upstream = %q, want vimm-like", result.Headers.Get("X-Upstream"))
	}
	if len(result.Cookies) != 1 || result.Cookies[0].Name != "challenge" || result.Cookies[0].Value != "accepted" {
		t.Fatalf("Cookies = %v, want challenge=accepted", result.Cookies)
	}
}

func TestSessionClientDoWithRedirectCheckBlocksRedirectBeforeSendingRequest(t *testing.T) {
	for _, statusCode := range []int{
		http.StatusSeeOther,
		http.StatusTemporaryRedirect,
		http.StatusPermanentRedirect,
	} {
		t.Run(http.StatusText(statusCode), func(t *testing.T) {
			redirectErr := errors.New("redirect blocked")
			receivedByOtherHost := make(chan struct{}, 1)

			otherHost := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
				receivedByOtherHost <- struct{}{}
			}))
			defer otherHost.Close()

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				http.Redirect(w, r, otherHost.URL+"/stolen", statusCode)
			}))
			defer server.Close()

			session, err := NewSessionClient(Config{})
			if err != nil {
				t.Fatalf("NewSessionClient() error = %v", err)
			}
			req, err := http.NewRequestWithContext(
				context.Background(),
				http.MethodPost,
				server.URL+"/submit",
				strings.NewReader("secret=turnstile-token"),
			)
			if err != nil {
				t.Fatalf("NewRequestWithContext() error = %v", err)
			}

			_, err = session.DoWithRedirectCheck(req, func(next *http.Request, _ []*http.Request) error {
				if next.URL.Host != req.URL.Host {
					return redirectErr
				}
				return nil
			})
			if !errors.Is(err, redirectErr) {
				t.Fatalf("DoWithRedirectCheck() error = %v, want redirectErr", err)
			}
			select {
			case <-receivedByOtherHost:
				t.Fatal("blocked redirect sent a request to another host")
			default:
			}
		})
	}
}

func TestSessionClientDoWithRedirectCheckBlocksHTTPSDowngrade(t *testing.T) {
	redirectErr := errors.New("HTTPS downgrade blocked")
	receivedOverHTTP := make(chan struct{}, 1)

	httpServer := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		receivedOverHTTP <- struct{}{}
	}))
	defer httpServer.Close()

	httpsServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, httpServer.URL+"/stolen", http.StatusTemporaryRedirect)
	}))
	defer httpsServer.Close()

	session, err := NewSessionClient(Config{})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}
	session.client.Transport = httpsServer.Client().Transport
	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		httpsServer.URL+"/submit",
		strings.NewReader("secret=turnstile-token"),
	)
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}

	_, err = session.DoWithRedirectCheck(req, func(next *http.Request, _ []*http.Request) error {
		if next.URL.Scheme != "https" {
			return redirectErr
		}
		return nil
	})
	if !errors.Is(err, redirectErr) {
		t.Fatalf("DoWithRedirectCheck() error = %v, want redirectErr", err)
	}
	select {
	case <-receivedOverHTTP:
		t.Fatal("blocked redirect sent the Turnstile token over HTTP")
	default:
	}
}

func TestSessionClientDoHandlesNilHeadersAndPreservesExplicitUserAgent(t *testing.T) {
	const defaultUserAgent = "Retrorb/1.0"
	tests := []struct {
		name          string
		header        http.Header
		wantUserAgent string
	}{
		{name: "nil headers use default", wantUserAgent: defaultUserAgent},
		{
			name:          "explicit User-Agent is preserved",
			header:        http.Header{"User-Agent": []string{"Caller/2.0"}},
			wantUserAgent: "Caller/2.0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session, err := NewSessionClient(Config{UserAgent: defaultUserAgent})
			if err != nil {
				t.Fatalf("NewSessionClient() error = %v", err)
			}
			session.client.Transport = roundTripperFunc(func(request *http.Request) (*http.Response, error) {
				if got := request.UserAgent(); got != tt.wantUserAgent {
					t.Fatalf("User-Agent = %q, want %q", got, tt.wantUserAgent)
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     make(http.Header),
					Body:       io.NopCloser(strings.NewReader("ok")),
					Request:    request,
				}, nil
			})
			request := &http.Request{
				Method: http.MethodGet,
				URL:    &url.URL{Scheme: "https", Host: "example.com", Path: "/"},
				Header: tt.header,
			}

			if _, err := session.Do(request); err != nil {
				t.Fatalf("Do() error = %v", err)
			}
		})
	}
}

func TestSessionClientGetHonorsConfiguredTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	session, err := NewSessionClient(Config{Timeout: 20 * time.Millisecond})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}

	if _, err := session.Get(context.Background(), server.URL); err == nil {
		t.Fatal("Get() error = nil, want timeout error")
	}
}

func TestSessionClientGetRejectsRedirectAtConfiguredLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/again", http.StatusFound)
	}))
	defer server.Close()

	session, err := NewSessionClient(Config{MaxRedirects: 1})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}

	_, err = session.Get(context.Background(), server.URL)
	if !errors.Is(err, ErrRedirectLimitExceeded) {
		t.Fatalf("Get() error = %v, want ErrRedirectLimitExceeded", err)
	}
}

func TestSessionClientGetEnforcesBodyLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		size := int64(maxBodyBytes)
		if r.URL.Query().Get("oversize") == "1" {
			size++
		}
		w.Header().Set("Content-Length", fmt.Sprint(size))
		_, _ = io.CopyN(w, repeatingReader('x'), size)
	}))
	defer server.Close()

	session, err := NewSessionClient(Config{Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}

	result, err := session.Get(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("Get() exact limit error = %v", err)
	}
	if len(result.HTML) != maxBodyBytes {
		t.Fatalf("exact-limit body length = %d, want %d", len(result.HTML), maxBodyBytes)
	}

	_, err = session.Get(context.Background(), server.URL+"?oversize=1")
	if !errors.Is(err, ErrResponseTooLarge) {
		t.Fatalf("Get() oversize error = %v, want ErrResponseTooLarge", err)
	}
}

func TestSessionClientGetCookiesRejectsInvalidURL(t *testing.T) {
	session, err := NewSessionClient(Config{})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}

	if _, err := session.GetCookies("://bad-url"); err == nil {
		t.Fatal("GetCookies() error = nil, want URL parse error")
	}
}

func TestSessionClientRejectsCookieForPublicSuffix(t *testing.T) {
	session, err := NewSessionClient(Config{})
	if err != nil {
		t.Fatalf("NewSessionClient() error = %v", err)
	}

	assertRejected := func(stage string) {
		t.Helper()
		origin := &url.URL{Scheme: "https", Host: "foo.co.uk", Path: "/"}
		session.client.Jar.SetCookies(origin, []*http.Cookie{{
			Name:   "cross_site",
			Value:  "poisoned",
			Domain: "co.uk",
			Path:   "/",
		}})

		cookies, getErr := session.GetCookies("https://bar.co.uk/")
		if getErr != nil {
			t.Fatalf("GetCookies() %s error = %v", stage, getErr)
		}
		if len(cookies) != 0 {
			t.Fatalf("GetCookies() %s = %v, want public-suffix cookie rejected", stage, cookies)
		}
	}

	assertRejected("before clear")
	if err := session.ClearCookies(); err != nil {
		t.Fatalf("ClearCookies() error = %v", err)
	}
	assertRejected("after clear")
}

func TestSessionResultSaveHTMLCreatesPrivateFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "response.html")
	result := &SessionResult{HTML: "<html>private</html>"}

	if err := result.SaveHTML(path); err != nil {
		t.Fatalf("SaveHTML() error = %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(data) != result.HTML {
		t.Fatalf("saved HTML = %q, want %q", data, result.HTML)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat() error = %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("saved mode = %o, want 600", got)
	}
}
