# Session Client and Turnstile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable stateful Go HTTP session with optional 2Captcha Turnstile solving.

**Architecture:** A new internal infrastructure package owns an `http.Client`, synchronized CookieJar replacement, response limits, and a small adapter over `2captcha-go`. The public contract exposes ordinary session operations and a typed Turnstile request/result while a private solver interface keeps tests local and credit-free.

**Tech Stack:** Go 1.27, standard `net/http`, `net/http/cookiejar`, `httptest`, `github.com/2captcha/2captcha-go` v1.1.12.

**Spec:** `docs/superpowers/specs/2026-11-27-session-client-turnstile-design.md`

## Global Constraints

- Place all production code in `api/internal/infrastructure/session`.
- Cap response bodies at exactly 20 MiB and save HTML with mode `0600`.
- Do not add an HTTP endpoint or automatic Turnstile parameter extraction/submission.
- Do not contact 2Captcha from tests.
- Future callers must validate user-controlled target URLs against SSRF at their system boundary.

## Review Focus

- A response of exactly 20 MiB must succeed; 20 MiB plus one byte must fail.
- Redirect loops must stop at the configured limit and preserve an identifiable error.
- Clearing cookies concurrently with requests must not race.
- Empty 2Captcha configuration must leave ordinary HTTP sessions usable and make only solving fail.
- Context cancellation must return without waiting for the third-party solver timeout.

---

### Task 1: Stateful HTTP session

**Files:**
- Create: `api/internal/infrastructure/session/client.go`
- Test: `api/internal/infrastructure/session/client_test.go`

**Interfaces:**
- Produces: `Config`, `SessionClient`, `SessionResult`, `NewSessionClient`, `Get`, `GetCookies`, `ClearCookies`, and `SaveHTML`.

- [ ] **Step 1: Write failing HTTP session tests**

Cover default timeout/redirect behavior through observable requests, configured User-Agent, final redirected URL, cloned headers, accumulated cookies, cookie clearing, exact/oversize bodies, redirect-limit errors, and `0600` HTML output.

- [ ] **Step 2: Verify the package does not yet compile**

Run: `go test ./internal/infrastructure/session`
Expected: FAIL because the package contract is undefined.

- [ ] **Step 3: Implement the minimal session client**

Use the signatures in the design and an `RWMutex` around operations that use or replace the CookieJar. Wrap errors with operation context and expose sentinel errors for the body and redirect limits.

- [ ] **Step 4: Verify the session tests pass**

Run: `go test ./internal/infrastructure/session`
Expected: PASS.

### Task 2: 2Captcha Turnstile adapter

**Files:**
- Create: `api/internal/infrastructure/session/turnstile.go`
- Test: `api/internal/infrastructure/session/turnstile_test.go`
- Modify: `api/go.mod`
- Modify: `api/go.sum`

**Interfaces:**
- Consumes: `Config` and `SessionClient` from Task 1.
- Produces: `TwoCaptchaConfig`, `TurnstileRequest`, `TurnstileResult`, and `(*SessionClient).SolveTurnstile(context.Context, TurnstileRequest)`.

- [ ] **Step 1: Write failing Turnstile adapter tests**

Assert standalone and challenge fields map to `api2captcha.CloudflareTurnstile.ToRequest`, session User-Agent fallback and explicit override behavior, empty key/input errors, solver error wrapping, token/task ID results, and prompt context cancellation.

- [ ] **Step 2: Verify the tests fail for missing behavior**

Run: `go test ./internal/infrastructure/session -run Turnstile`
Expected: FAIL because Turnstile types and methods are undefined.

- [ ] **Step 3: Integrate the `2captcha-go` version resolved by `go get -u` (`v1.1.12`)**

Add the module dependency, construct the official client from `TwoCaptchaConfig`, translate durations to positive whole seconds, and adapt `Solve` behind a private interface.

- [ ] **Step 4: Implement cancellation and result mapping**

Run the bounded library solve in a single-result buffered channel and select on `ctx.Done()`. Return token plus task ID without logging or exposing the API key.

- [ ] **Step 5: Verify focused tests pass**

Run: `go test ./internal/infrastructure/session -run Turnstile`
Expected: PASS.

### Task 3: Whole API verification

**Files:**
- Verify only; adjust the new package if integration checks reveal issues.

**Interfaces:**
- Consumes: completed session package.
- Produces: a buildable, race-tested API module.

- [ ] **Step 1: Format and vet**

Run: `gofmt -w internal/infrastructure/session/*.go && go vet ./...`
Expected: clean output.

- [ ] **Step 2: Run the full test suite**

Run: `go test ./...`
Expected: PASS.

- [ ] **Step 3: Run race detection**

Run: `go test -race ./...`
Expected: PASS.

- [ ] **Step 4: Inspect the final diff**

Confirm only the new package, dependency metadata, design, and plan changed; confirm no API key or generated HTML was added.
