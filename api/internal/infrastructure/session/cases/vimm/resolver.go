// Package vimm implements Vimm's Turnstile challenge submission flow.
package vimm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"retromancy/api/internal/infrastructure/session"
	"retromancy/api/internal/infrastructure/session/cases"
)

var (
	// ErrInvalidTarget indicates that a URL is not a safe HTTPS Vimm target.
	ErrInvalidTarget = errors.New("vimm: invalid target")
	// ErrChallengeNotAccepted indicates that Vimm did not return a successful Vimm page.
	ErrChallengeNotAccepted = errors.New("vimm: Turnstile challenge not accepted")
)

// Resolver solves and submits Turnstile challenges for Vimm pages.
type Resolver struct {
	session cases.Session
}

var _ cases.Resolver = (*Resolver)(nil)

// New creates a Vimm resolver using a generic stateful session.
func New(client cases.Session) *Resolver {
	return &Resolver{session: client}
}

// Resolve solves the page challenge, submits the token, and returns Vimm's final page.
func (r *Resolver) Resolve(ctx context.Context, target string) (*cases.Result, error) {
	if r == nil || r.session == nil {
		return nil, errors.New("vimm: session is not configured")
	}

	target, parsedTarget, err := validTarget(target)
	if err != nil {
		return nil, err
	}

	solved, err := r.session.SolveTurnstile(ctx, session.TurnstileRequest{
		URL:           target,
		RedirectCheck: checkVimmRedirect,
	})
	if err != nil {
		return nil, fmt.Errorf("solve Vimm Turnstile: %w", err)
	}
	if solved == nil || strings.TrimSpace(solved.Token) == "" {
		return &cases.Result{Turnstile: solved}, fmt.Errorf(
			"%w: solver returned an empty token",
			ErrChallengeNotAccepted,
		)
	}

	form := url.Values{"cf-turnstile-response": {solved.Token}}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		target,
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return &cases.Result{Turnstile: solved}, fmt.Errorf("create Vimm challenge request: %w", err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Origin", (&url.URL{Scheme: parsedTarget.Scheme, Host: parsedTarget.Host}).String())
	request.Header.Set("Referer", target)

	page, err := r.session.DoWithRedirectCheck(request, checkVimmRedirect)
	if err != nil {
		return &cases.Result{Turnstile: solved}, fmt.Errorf("submit Vimm Turnstile token: %w", err)
	}
	result := &cases.Result{Turnstile: solved, Page: page}
	if page == nil {
		return result, fmt.Errorf("%w: session returned no page", ErrChallengeNotAccepted)
	}
	if page.StatusCode < http.StatusOK || page.StatusCode >= http.StatusMultipleChoices {
		return result, fmt.Errorf(
			"%w: final HTTP status %d",
			ErrChallengeNotAccepted,
			page.StatusCode,
		)
	}
	if _, _, err := validTarget(page.URL); err != nil {
		return result, fmt.Errorf(
			"%w: final URL %q is outside Vimm",
			ErrChallengeNotAccepted,
			page.URL,
		)
	}

	return result, nil
}

func checkVimmRedirect(next *http.Request, _ []*http.Request) error {
	if next == nil || next.URL == nil {
		return fmt.Errorf("%w: redirect has no URL", ErrChallengeNotAccepted)
	}
	if _, _, err := validTarget(next.URL.String()); err != nil {
		return fmt.Errorf(
			"%w: unsafe redirect to %q",
			ErrChallengeNotAccepted,
			next.URL.String(),
		)
	}
	return nil
}

func validTarget(rawURL string) (string, *url.URL, error) {
	target := strings.TrimSpace(rawURL)
	parsed, err := url.Parse(target)
	if err != nil || parsed.User != nil || parsed.Host == "" || !strings.EqualFold(parsed.Scheme, "https") {
		return "", nil, ErrInvalidTarget
	}

	hostname := strings.ToLower(parsed.Hostname())
	if hostname != "vimm.net" && !strings.HasSuffix(hostname, ".vimm.net") {
		return "", nil, ErrInvalidTarget
	}

	return target, parsed, nil
}
