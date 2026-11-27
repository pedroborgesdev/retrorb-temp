# Automatic Turnstile Sitekey Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover a Turnstile sitekey from the target page whenever callers omit `TurnstileRequest.SiteKey`.

**Architecture:** Extend the existing session Turnstile adapter with a pure HTML extractor and an automatic fetch fallback. The existing `SessionClient.Get` supplies bounded, context-aware, cookie-preserving page retrieval; the final redirected URL becomes the 2Captcha page URL.

**Tech Stack:** Go, `golang.org/x/net/html`, standard `regexp`, `httptest`, existing 2Captcha adapter.

**Spec:** `docs/superpowers/specs/2026-11-27-turnstile-sitekey-detection-design.md`

## Global Constraints

- Preserve manual `SiteKey` as an override with no page fetch.
- Reuse the existing session GET and its 20 MiB body limit.
- Do not execute fetched JavaScript or expose the 2Captcha API key.

## Review Focus

- `data-sitekey` with surrounding whitespace must normalize to the actual key.
- Explicit-render JavaScript with quoted `sitekey` must be detected only in Turnstile-related scripts.
- A page without a supported sitekey must return `ErrTurnstileSiteKeyNotFound` and never call 2Captcha.
- A redirect must cause the final URL to be sent as `pageurl`.
- A supplied manual sitekey must avoid the automatic HTTP fetch.

---

### Task 1: Sitekey extraction and automatic solve fallback

**Files:**
- Modify: `api/internal/infrastructure/session/turnstile.go`
- Modify: `api/internal/infrastructure/session/turnstile_test.go`

**Interfaces:**
- Consumes: `(*SessionClient).Get(context.Context, string) (*SessionResult, error)` and existing `TurnstileRequest`.
- Produces: `detectTurnstileSiteKey(string) (string, error)`, `ErrTurnstileSiteKeyNotFound`, and automatic fallback behavior in `SolveTurnstile`.

- [ ] **Step 1: Write failing extraction tests**

Add table-driven tests for implicit `data-sitekey`, explicit `turnstile.render` configuration, whitespace normalization, unrelated markup, and missing keys. A realistic removal of either extraction branch must fail its corresponding test.

- [ ] **Step 2: Verify the extractor tests fail**

Run: `go test ./internal/infrastructure/session -run 'TestDetectTurnstileSiteKey' -count=1`

Expected: compilation failure because the extractor and sentinel do not exist.

- [ ] **Step 3: Implement the pure extractor**

Add `detectTurnstileSiteKey(pageHTML string) (string, error)` using the HTML tokenizer for `data-sitekey`, then a constrained quoted-property matcher for inline Turnstile scripts. Return `ErrTurnstileSiteKeyNotFound` when no non-empty key is found.

- [ ] **Step 4: Verify extraction tests pass**

Run: `go test ./internal/infrastructure/session -run 'TestDetectTurnstileSiteKey' -count=1`

Expected: PASS.

- [ ] **Step 5: Write failing integration tests**

Test that `SolveTurnstile` with an empty sitekey fetches through the session, preserves the configured User-Agent, submits the detected key with the final redirect URL, and does not submit when the key is absent. Keep the existing manual-sitekey test as the no-fetch regression.

- [ ] **Step 6: Verify integration tests fail**

Run: `go test ./internal/infrastructure/session -run 'TestSolveTurnstileAuto' -count=1`

Expected: FAIL with `ErrInvalidTurnstileRequest` before any solver call.

- [ ] **Step 7: Implement the automatic fallback**

Split URL validation from request mapping. In `SolveTurnstile`, resolve the sitekey before taking the paid-task semaphore; fetch only when `SiteKey` is empty, and replace the request URL with `SessionResult.URL` after redirects.

- [ ] **Step 8: Run full verification**

Run: `go test -count=1 ./...`, `go test -race -count=1 ./...`, `go vet ./...`, and `go mod verify` from `api/`.

Expected: all commands pass.
