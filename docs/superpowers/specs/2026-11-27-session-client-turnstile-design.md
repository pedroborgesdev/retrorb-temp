# Session Client and Turnstile Design

## Intent

Provide the Go API with a reusable, stateful HTTP session that can be instantiated now and called by application services later. The same package must optionally solve Cloudflare Turnstile challenges through the official `2captcha-go` client without exposing an HTTP endpoint or hardcoding credentials.

## Goals

- Keep cookies across requests, follow a bounded number of redirects, apply a configurable User-Agent and timeout, and cap response bodies at 20 MiB.
- Expose response status, final URL, HTML, cookies, headers, and elapsed duration.
- Allow callers to inspect or clear cookies and save HTML with mode `0600`.
- Solve standalone Turnstile widgets and Cloudflare challenge-page Turnstile requests.
- Keep the 2Captcha API key optional so ordinary sessions do not require the paid service.
- Respect caller cancellation while the upstream library is solving.

## Non-goals

- No new HTTP route, handler, application service, or startup wiring.
- No automatic extraction of Turnstile parameters from HTML or JavaScript.
- No automatic submission of the returned token to the target website.
- No proxy configuration or other captcha types.
- No SSRF policy inside the generic client; any future user-controlled URL must be validated at its external boundary.

## Constraints

- Package location: `api/internal/infrastructure/session`.
- Dependency: `github.com/2captcha/2captcha-go` resolved by the requested `go get -u` command to `v1.1.12`.
- Turnstile fields follow the library contract: `sitekey`, `pageurl`, and optional `action`, `data`, `pagedata`, and `userAgent`.
- The third-party solver has no context-aware API. Cancellation returns immediately to the caller while its bounded solve operation may finish in the background.
- The CookieJar replacement performed by `ClearCookies` must not race with active session operations.

## Approaches

1. Put the client in `netsec`. Rejected because `netsec` enforces download-specific SSRF and DNS-pinning rules that do not describe a general browsing session.
2. Put it in `providers`. Rejected because this would couple reusable HTTP state and captcha solving to scraper implementations.
3. Create a focused `session` infrastructure package. Selected because it keeps the reusable stateful client independent while remaining internal to the API.

For Turnstile, a separate top-level solver package was considered. The selected design keeps the adapter in the same `session` package and attaches `SolveTurnstile` to `SessionClient`, which guarantees the configured session User-Agent is used unless a request explicitly overrides it.

## Public contract

- `NewSessionClient(Config) (*SessionClient, error)`
- `(*SessionClient).Get(context.Context, string) (*SessionResult, error)`
- `(*SessionClient).GetCookies(string) ([]*http.Cookie, error)`
- `(*SessionClient).ClearCookies() error`
- `(*SessionResult).SaveHTML(string) error`
- `(*SessionClient).SolveTurnstile(context.Context, TurnstileRequest) (*TurnstileResult, error)`

`Config` contains HTTP session settings plus a nested `TwoCaptchaConfig` with API key, solve timeout, and polling interval. `TurnstileRequest` supports both standalone and challenge-page fields. `TurnstileResult` returns the solution token and the 2Captcha task ID.

## Verification

Use local `httptest` servers and an injected fake captcha solver. Tests cover defaults, headers, redirect limits, final URL, body cap, cookies, clearing, file permissions, Turnstile field mapping, optional configuration, errors, and cancellation. No test spends 2Captcha credit or contacts external services.
