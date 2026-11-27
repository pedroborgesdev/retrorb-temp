// Package cases defines contracts shared by site-specific Turnstile flows.
package cases

import (
	"context"
	"net/http"

	"retromancy/api/internal/infrastructure/session"
)

// Session is the narrow generic-session behavior required by a site case.
type Session interface {
	SolveTurnstile(context.Context, session.TurnstileRequest) (*session.TurnstileResult, error)
	DoWithRedirectCheck(*http.Request, session.RedirectCheck) (*session.SessionResult, error)
}

// Result contains both the paid solve metadata and the site's final page.
type Result struct {
	Turnstile *session.TurnstileResult
	Page      *session.SessionResult
}

// Resolver completes a site's Turnstile flow for a target page.
type Resolver interface {
	Resolve(context.Context, string) (*Result, error)
}
