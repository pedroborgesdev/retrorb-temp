package session

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	api2captcha "github.com/2captcha/2captcha-go"
	"golang.org/x/net/html"
)

const (
	defaultCaptchaTimeout         = 120 * time.Second
	defaultCaptchaPollingInterval = 10 * time.Second
)

var explicitTurnstileSiteKeyPattern = regexp.MustCompile(
	`(?is)\bturnstile\s*\.\s*render\s*\(.*?(?:["']sitekey["']|\bsitekey\b)\s*:\s*(?:"([^"]+)"|'([^']+)')`,
)

var (
	// ErrTwoCaptchaNotConfigured indicates that SolveTurnstile was called without an API key.
	ErrTwoCaptchaNotConfigured = errors.New("session: 2captcha is not configured")
	// ErrInvalidTurnstileRequest indicates missing or invalid Turnstile target data.
	ErrInvalidTurnstileRequest = errors.New("session: invalid Turnstile request")
	// ErrTurnstileSiteKeyNotFound indicates that a page has no supported Turnstile widget configuration.
	ErrTurnstileSiteKeyNotFound = errors.New("session: Turnstile sitekey not found")
)

// TwoCaptchaConfig configures optional Turnstile solving through 2Captcha.
type TwoCaptchaConfig struct {
	APIKey          string
	Timeout         time.Duration
	PollingInterval time.Duration
}

// TurnstileRequest describes either a standalone widget or a Cloudflare challenge page.
type TurnstileRequest struct {
	SiteKey   string
	URL       string
	Data      string
	PageData  string
	Action    string
	UserAgent string
	// RedirectCheck validates redirects while fetching a page for automatic sitekey discovery.
	RedirectCheck RedirectCheck
}

// TurnstileResult contains the solved token and the 2Captcha task identifier.
type TurnstileResult struct {
	Token     string
	CaptchaID string
}

type captchaSolver interface {
	Solve(api2captcha.Request) (token string, captchaID string, err error)
}

type captchaSolveResult struct {
	token     string
	captchaID string
	err       error
}

func newTwoCaptchaSolver(config TwoCaptchaConfig) captchaSolver {
	apiKey := strings.TrimSpace(config.APIKey)
	if apiKey == "" {
		return nil
	}

	client := api2captcha.NewClientExt(apiKey, &http.Client{})
	client.DefaultTimeout = durationSeconds(config.Timeout, defaultCaptchaTimeout)
	client.PollingInterval = durationSeconds(config.PollingInterval, defaultCaptchaPollingInterval)
	return client
}

func durationSeconds(value, fallback time.Duration) int {
	if value <= 0 {
		value = fallback
	}
	return int((value + time.Second - 1) / time.Second)
}

func detectTurnstileSiteKey(pageHTML string) (string, error) {
	tokenizer := html.NewTokenizer(strings.NewReader(pageHTML))
	inScript := false

	for {
		switch tokenizer.Next() {
		case html.ErrorToken:
			if err := tokenizer.Err(); err != nil && !errors.Is(err, io.EOF) {
				return "", fmt.Errorf("parse Turnstile page HTML: %w", err)
			}
			return "", ErrTurnstileSiteKeyNotFound

		case html.StartTagToken:
			token := tokenizer.Token()
			if strings.EqualFold(token.Data, "script") {
				inScript = true
				continue
			}

			var className, siteKey string
			for _, attribute := range token.Attr {
				switch strings.ToLower(attribute.Key) {
				case "class":
					className = attribute.Val
				case "data-sitekey":
					siteKey = strings.TrimSpace(attribute.Val)
				}
			}
			if siteKey != "" && hasHTMLClass(className, "cf-turnstile") {
				return siteKey, nil
			}

		case html.EndTagToken:
			if strings.EqualFold(tokenizer.Token().Data, "script") {
				inScript = false
			}

		case html.TextToken:
			if !inScript {
				continue
			}
			matches := explicitTurnstileSiteKeyPattern.FindStringSubmatch(string(tokenizer.Text()))
			if len(matches) == 0 {
				continue
			}
			for _, match := range matches[1:] {
				if siteKey := strings.TrimSpace(match); siteKey != "" {
					return siteKey, nil
				}
			}
		}
	}
}

func hasHTMLClass(className, target string) bool {
	for _, name := range strings.Fields(className) {
		if name == target {
			return true
		}
	}
	return false
}

// SolveTurnstile submits a Turnstile task and waits for its token or caller cancellation.
func (s *SessionClient) SolveTurnstile(ctx context.Context, input TurnstileRequest) (*TurnstileResult, error) {
	if s.captchaSolver == nil {
		return nil, ErrTwoCaptchaNotConfigured
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	input, err := s.resolveTurnstileRequest(ctx, input)
	if err != nil {
		return nil, err
	}
	request, err := s.turnstileAPIRequest(input)
	if err != nil {
		return nil, err
	}
	select {
	case s.captchaSlot <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if err := ctx.Err(); err != nil {
		<-s.captchaSlot
		return nil, err
	}

	resultCh := make(chan captchaSolveResult, 1)
	go func() {
		defer func() { <-s.captchaSlot }()
		token, captchaID, solveErr := s.captchaSolver.Solve(request)
		resultCh <- captchaSolveResult{token: token, captchaID: captchaID, err: solveErr}
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case result := <-resultCh:
		if result.err != nil {
			return nil, fmt.Errorf("solve Turnstile with 2Captcha: %w", result.err)
		}
		return &TurnstileResult{Token: result.token, CaptchaID: result.captchaID}, nil
	}
}

func (s *SessionClient) resolveTurnstileRequest(
	ctx context.Context,
	input TurnstileRequest,
) (TurnstileRequest, error) {
	pageURL, err := validTurnstilePageURL(input.URL)
	if err != nil {
		return TurnstileRequest{}, err
	}
	input.URL = pageURL
	input.SiteKey = strings.TrimSpace(input.SiteKey)
	if input.SiteKey != "" {
		return input, nil
	}

	page, err := s.get(ctx, pageURL, input.RedirectCheck)
	if err != nil {
		return TurnstileRequest{}, fmt.Errorf("fetch Turnstile page %q: %w", pageURL, err)
	}
	siteKey, err := detectTurnstileSiteKey(page.HTML)
	if err != nil {
		return TurnstileRequest{}, fmt.Errorf("detect Turnstile sitekey at %q: %w", page.URL, err)
	}

	input.SiteKey = siteKey
	input.URL = page.URL
	return input, nil
}

func validTurnstilePageURL(rawURL string) (string, error) {
	pageURL := strings.TrimSpace(rawURL)
	parsedURL, err := url.Parse(pageURL)
	if err != nil || parsedURL.Host == "" || parsedURL.User != nil ||
		(parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return "", ErrInvalidTurnstileRequest
	}
	return pageURL, nil
}

func (s *SessionClient) turnstileAPIRequest(input TurnstileRequest) (api2captcha.Request, error) {
	siteKey := strings.TrimSpace(input.SiteKey)
	pageURL, err := validTurnstilePageURL(input.URL)
	if siteKey == "" || err != nil {
		return api2captcha.Request{}, ErrInvalidTurnstileRequest
	}

	userAgent := strings.TrimSpace(input.UserAgent)
	if userAgent == "" {
		userAgent = s.config.UserAgent
	}

	// Field mapping follows the official CloudflareTurnstile adapter.
	// Source: https://github.com/2captcha/2captcha-go/blob/v1.1.12/api2captcha.go
	captcha := api2captcha.CloudflareTurnstile{
		SiteKey:   siteKey,
		Url:       pageURL,
		Data:      input.Data,
		PageData:  input.PageData,
		Action:    input.Action,
		UserAgent: userAgent,
	}
	return captcha.ToRequest(), nil
}
