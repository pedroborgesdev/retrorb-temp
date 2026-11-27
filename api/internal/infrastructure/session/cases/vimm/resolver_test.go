package vimm

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"retromancy/api/internal/infrastructure/session"
)

type stubSession struct {
	solve func(context.Context, session.TurnstileRequest) (*session.TurnstileResult, error)
	do    func(*http.Request, session.RedirectCheck) (*session.SessionResult, error)
}

func (s stubSession) SolveTurnstile(
	ctx context.Context,
	request session.TurnstileRequest,
) (*session.TurnstileResult, error) {
	return s.solve(ctx, request)
}

func (s stubSession) Do(request *http.Request) (*session.SessionResult, error) {
	return s.do(request, nil)
}

func (s stubSession) DoWithRedirectCheck(
	request *http.Request,
	check session.RedirectCheck,
) (*session.SessionResult, error) {
	return s.do(request, check)
}

func TestResolverSubmitsSolvedTokenUsingVimmFlow(t *testing.T) {
	const target = "https://vimm.net/vault/5360"
	solved := &session.TurnstileResult{Token: "token+with/symbols", CaptchaID: "captcha-123"}
	page := &session.SessionResult{
		StatusCode: http.StatusOK,
		URL:        target,
		HTML:       "<html>resolved page</html>",
		Cookies:    []*http.Cookie{{Name: "challenge", Value: "accepted"}},
		Headers:    http.Header{"Content-Type": []string{"text/html"}},
		Duration:   20 * time.Millisecond,
	}

	var solveRequest session.TurnstileRequest
	var submittedRequest *http.Request
	var submittedBody string
	var submitRedirectCheck session.RedirectCheck
	client := stubSession{
		solve: func(_ context.Context, request session.TurnstileRequest) (*session.TurnstileResult, error) {
			solveRequest = request
			return solved, nil
		},
		do: func(request *http.Request, check session.RedirectCheck) (*session.SessionResult, error) {
			submittedRequest = request.Clone(request.Context())
			submitRedirectCheck = check
			body, err := io.ReadAll(request.Body)
			if err != nil {
				t.Fatalf("ReadAll(request.Body) error = %v", err)
			}
			submittedBody = string(body)
			return page, nil
		},
	}

	result, err := New(client).Resolve(context.Background(), target)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if solveRequest.URL != target || solveRequest.SiteKey != "" || solveRequest.RedirectCheck == nil {
		t.Fatalf("SolveTurnstile() request = %+v, want URL and Vimm redirect policy", solveRequest)
	}
	assertVimmRedirectCheck(t, solveRequest.RedirectCheck)
	assertVimmRedirectCheck(t, submitRedirectCheck)
	if submittedRequest.Method != http.MethodPost {
		t.Fatalf("submitted method = %q, want POST", submittedRequest.Method)
	}
	if submittedRequest.URL.String() != target {
		t.Fatalf("submitted URL = %q, want %q", submittedRequest.URL, target)
	}
	if got := submittedRequest.Header.Get("Content-Type"); got != "application/x-www-form-urlencoded" {
		t.Fatalf("Content-Type = %q, want form encoding", got)
	}
	if got := submittedRequest.Header.Get("Origin"); got != "https://vimm.net" {
		t.Fatalf("Origin = %q, want https://vimm.net", got)
	}
	if got := submittedRequest.Header.Get("Referer"); got != target {
		t.Fatalf("Referer = %q, want %q", got, target)
	}
	if submittedBody != "cf-turnstile-response=token%2Bwith%2Fsymbols" {
		t.Fatalf("submitted body = %q, want only encoded Turnstile token", submittedBody)
	}
	if result.Turnstile != solved || result.Page != page {
		t.Fatalf("Resolve() = %+v, want solve metadata and final page", result)
	}
}

func TestResolverRejectsInvalidVimmTargetBeforeSolving(t *testing.T) {
	tests := []string{
		"http://vimm.net/vault/5360",
		"https://vimm.net.evil.example/vault/5360",
		"https://user@vimm.net/vault/5360",
		"https:///vault/5360",
		"not a URL",
	}

	for _, target := range tests {
		t.Run(strings.ReplaceAll(target, "/", "_"), func(t *testing.T) {
			solved := false
			client := stubSession{
				solve: func(context.Context, session.TurnstileRequest) (*session.TurnstileResult, error) {
					solved = true
					return &session.TurnstileResult{Token: "must-not-submit"}, nil
				},
				do: func(*http.Request, session.RedirectCheck) (*session.SessionResult, error) {
					t.Fatal("Do() called for invalid Vimm target")
					return nil, nil
				},
			}

			_, err := New(client).Resolve(context.Background(), target)
			if !errors.Is(err, ErrInvalidTarget) {
				t.Fatalf("Resolve() error = %v, want ErrInvalidTarget", err)
			}
			if solved {
				t.Fatal("invalid target was submitted to Turnstile solver")
			}
		})
	}
}

func TestResolverWrapsSolverAndSubmissionErrors(t *testing.T) {
	solverErr := errors.New("2captcha unavailable")
	submitErr := errors.New("Vimm unavailable")

	t.Run("solver", func(t *testing.T) {
		client := stubSession{
			solve: func(context.Context, session.TurnstileRequest) (*session.TurnstileResult, error) {
				return nil, solverErr
			},
			do: func(*http.Request, session.RedirectCheck) (*session.SessionResult, error) {
				t.Fatal("Do() called after solver error")
				return nil, nil
			},
		}

		_, err := New(client).Resolve(context.Background(), "https://vimm.net/vault/5360")
		if !errors.Is(err, solverErr) {
			t.Fatalf("Resolve() error = %v, want wrapped solver error", err)
		}
	})

	t.Run("submission", func(t *testing.T) {
		client := stubSession{
			solve: func(context.Context, session.TurnstileRequest) (*session.TurnstileResult, error) {
				return &session.TurnstileResult{Token: "solved-token", CaptchaID: "captcha-123"}, nil
			},
			do: func(*http.Request, session.RedirectCheck) (*session.SessionResult, error) {
				return nil, submitErr
			},
		}

		_, err := New(client).Resolve(context.Background(), "https://vimm.net/vault/5360")
		if !errors.Is(err, submitErr) {
			t.Fatalf("Resolve() error = %v, want wrapped submission error", err)
		}
	})
}

func TestResolverRejectsUnacceptedFinalPage(t *testing.T) {
	tests := []struct {
		name string
		page *session.SessionResult
	}{
		{
			name: "challenge status",
			page: &session.SessionResult{StatusCode: http.StatusNotFound, URL: "https://vimm.net/vault/5360"},
		},
		{
			name: "redirect outside Vimm",
			page: &session.SessionResult{StatusCode: http.StatusOK, URL: "https://evil.example/landing"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := stubSession{
				solve: func(context.Context, session.TurnstileRequest) (*session.TurnstileResult, error) {
					return &session.TurnstileResult{Token: "solved-token", CaptchaID: "captcha-123"}, nil
				},
				do: func(*http.Request, session.RedirectCheck) (*session.SessionResult, error) {
					return tt.page, nil
				},
			}

			result, err := New(client).Resolve(context.Background(), "https://vimm.net/vault/5360")
			if !errors.Is(err, ErrChallengeNotAccepted) {
				t.Fatalf("Resolve() error = %v, want ErrChallengeNotAccepted", err)
			}
			if result == nil || result.Page != tt.page {
				t.Fatalf("Resolve() result = %+v, want rejected page for diagnostics", result)
			}
		})
	}
}

func assertVimmRedirectCheck(t *testing.T, check session.RedirectCheck) {
	t.Helper()
	if check == nil {
		t.Fatal("Vimm redirect check is nil")
	}

	for _, rawURL := range []string{
		"https://vimm.net/vault/5360",
		"https://cdn.vimm.net/vault/5360",
	} {
		request, err := http.NewRequest(http.MethodGet, rawURL, nil)
		if err != nil {
			t.Fatalf("NewRequest(%q) error = %v", rawURL, err)
		}
		if err := check(request, nil); err != nil {
			t.Fatalf("redirect check rejected safe URL %q: %v", rawURL, err)
		}
	}

	for _, rawURL := range []string{
		"https://evil.example/stolen",
		"http://vimm.net/vault/5360",
	} {
		request, err := http.NewRequest(http.MethodGet, rawURL, nil)
		if err != nil {
			t.Fatalf("NewRequest(%q) error = %v", rawURL, err)
		}
		if err := check(request, nil); !errors.Is(err, ErrChallengeNotAccepted) {
			t.Fatalf("redirect check error for %q = %v, want ErrChallengeNotAccepted", rawURL, err)
		}
	}
}
