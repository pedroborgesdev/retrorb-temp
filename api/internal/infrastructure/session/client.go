// Package session provides stateful HTTP sessions for upstream website access.
package session

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"sync"
	"time"

	"golang.org/x/net/publicsuffix"
)

const (
	defaultTimeout      = 60 * time.Second
	defaultMaxRedirects = 10
	maxBodyBytes        = 20 * 1024 * 1024
)

var (
	// ErrRedirectLimitExceeded indicates that the configured redirect budget was exhausted.
	ErrRedirectLimitExceeded = errors.New("session: redirect limit exceeded")
	// ErrResponseTooLarge indicates that a response body exceeded 20 MiB.
	ErrResponseTooLarge = errors.New("session: response too large")
)

// Config controls requests made by a SessionClient.
type Config struct {
	Timeout      time.Duration
	UserAgent    string
	MaxRedirects int
	TwoCaptcha   TwoCaptchaConfig
}

// SessionClient performs HTTP requests with a shared in-memory CookieJar.
type SessionClient struct {
	client *http.Client
	config Config
	mu     sync.RWMutex

	captchaSolver captchaSolver
	captchaSlot   chan struct{}
}

// SessionResult contains the response and session metadata from a request.
type SessionResult struct {
	StatusCode int
	URL        string
	HTML       string
	Cookies    []*http.Cookie
	Headers    http.Header
	Duration   time.Duration
}

// RedirectCheck validates a redirect before the next request is sent.
type RedirectCheck func(next *http.Request, via []*http.Request) error

// NewSessionClient creates a stateful HTTP client using safe defaults for omitted limits.
func NewSessionClient(config Config) (*SessionClient, error) {
	if config.Timeout <= 0 {
		config.Timeout = defaultTimeout
	}
	if config.MaxRedirects <= 0 {
		config.MaxRedirects = defaultMaxRedirects
	}

	jar, err := newCookieJar()
	if err != nil {
		return nil, fmt.Errorf("create session cookie jar: %w", err)
	}

	client := &http.Client{
		Jar:     jar,
		Timeout: config.Timeout,
		CheckRedirect: func(_ *http.Request, via []*http.Request) error {
			if len(via) >= config.MaxRedirects {
				return ErrRedirectLimitExceeded
			}
			return nil
		},
	}

	return &SessionClient{
		client:        client,
		config:        config,
		captchaSolver: newTwoCaptchaSolver(config.TwoCaptcha),
		captchaSlot:   make(chan struct{}, 1),
	}, nil
}

func newCookieJar() (*cookiejar.Jar, error) {
	return cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
}

// Do executes a prepared request with the session's cookies, redirects, limits, and default User-Agent.
func (s *SessionClient) Do(req *http.Request) (*SessionResult, error) {
	return s.do(req, nil)
}

// DoWithRedirectCheck executes a request and validates every redirect before following it.
func (s *SessionClient) DoWithRedirectCheck(
	req *http.Request,
	check RedirectCheck,
) (*SessionResult, error) {
	return s.do(req, check)
}

func (s *SessionClient) do(req *http.Request, check RedirectCheck) (*SessionResult, error) {
	if req == nil {
		return nil, errors.New("session: request is nil")
	}
	if req.URL == nil {
		return nil, errors.New("session: request URL is nil")
	}

	request := req.Clone(req.Context())
	if request.Header == nil {
		request.Header = make(http.Header)
	}

	start := time.Now()
	if request.Header.Get("User-Agent") == "" && s.config.UserAgent != "" {
		request.Header.Set("User-Agent", s.config.UserAgent)
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	client := s.client
	if check != nil {
		baseRedirectCheck := s.client.CheckRedirect
		client = &http.Client{
			Transport: s.client.Transport,
			Jar:       s.client.Jar,
			Timeout:   s.client.Timeout,
			CheckRedirect: func(next *http.Request, via []*http.Request) error {
				if err := check(next, via); err != nil {
					return err
				}
				return baseRedirectCheck(next, via)
			},
		}
	}

	resp, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("session %s %q: %w", request.Method, request.URL.String(), err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read session response: %w", err)
	}
	if len(body) > maxBodyBytes {
		return nil, ErrResponseTooLarge
	}

	return &SessionResult{
		StatusCode: resp.StatusCode,
		URL:        resp.Request.URL.String(),
		HTML:       string(body),
		Cookies:    s.client.Jar.Cookies(resp.Request.URL),
		Headers:    resp.Header.Clone(),
		Duration:   time.Since(start),
	}, nil
}

// Get performs a GET request and returns the bounded response body with session metadata.
func (s *SessionClient) Get(ctx context.Context, target string) (*SessionResult, error) {
	return s.get(ctx, target, nil)
}

func (s *SessionClient) get(
	ctx context.Context,
	target string,
	check RedirectCheck,
) (*SessionResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, fmt.Errorf("create session GET request: %w", err)
	}
	return s.DoWithRedirectCheck(req, check)
}

// GetCookies returns cookies that the session would send to target.
func (s *SessionClient) GetCookies(target string) ([]*http.Cookie, error) {
	parsedURL, err := url.Parse(target)
	if err != nil {
		return nil, fmt.Errorf("parse cookie target URL: %w", err)
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.client.Jar.Cookies(parsedURL), nil
}

// ClearCookies replaces the current CookieJar with a new empty jar.
func (s *SessionClient) ClearCookies() error {
	jar, err := newCookieJar()
	if err != nil {
		return fmt.Errorf("create replacement session cookie jar: %w", err)
	}

	s.mu.Lock()
	s.client.Jar = jar
	s.mu.Unlock()
	return nil
}

// SaveHTML writes the response HTML to path with owner-only permissions.
func (r *SessionResult) SaveHTML(path string) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("open HTML output %q: %w", path, err)
	}
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return fmt.Errorf("secure HTML output %q: %w", path, err)
	}
	if _, err := file.WriteString(r.HTML); err != nil {
		_ = file.Close()
		return fmt.Errorf("write HTML output %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close HTML output %q: %w", path, err)
	}
	return nil
}
