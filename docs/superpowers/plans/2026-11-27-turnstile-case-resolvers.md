# Turnstile Case Resolvers Implementation Plan

**Goal:** Add an explicit, reusable site-case abstraction and implement the
Vimm Turnstile submission flow without coupling it to the generic solver.

**Architecture:** Extend `SessionClient` with a bounded arbitrary-request
method, define narrow contracts in `session/cases`, then implement Vimm as a
case that composes the generic solver and HTTP session. No environment or API
key handling is added to the case.

**Tech stack:** Go standard library, existing `session` package, existing
2Captcha adapter.

**Constraint:** Do not commit because the current API rewrite and surrounding
worktree changes belong to the user and are intentionally uncommitted.

---

### Task 1: Reusable session request execution

**Files:**
- Modify: `api/internal/infrastructure/session/client_test.go`
- Modify: `api/internal/infrastructure/session/client.go`

1. Add a failing test proving arbitrary POST requests use the configured
   User-Agent, retain cookies, follow a 303 as GET, and return final metadata.
2. Run the focused test and confirm it fails because `Do` does not exist.
3. Implement `SessionClient.Do`, a request-scoped redirect checker, and make
   `Get` delegate to the shared execution path.
4. Run all session package tests.

### Task 2: Common case contract and Vimm implementation

**Files:**
- Create: `api/internal/infrastructure/session/cases/case.go`
- Create: `api/internal/infrastructure/session/cases/vimm/resolver_test.go`
- Create: `api/internal/infrastructure/session/cases/vimm/resolver.go`

1. Add failing behavior tests for the exact Vimm form and headers, target
   validation, upstream error propagation, and rejected final responses.
2. Run the focused tests and confirm the package cannot yet compile.
3. Define the narrow session and resolver contracts plus shared result.
4. Implement the Vimm resolver with HTTPS/host validation on the initial URL,
   every discovery/submission redirect, and the final response.
5. Run the case tests and refactor only while they remain green.

### Task 3: Verification

1. Format all changed Go files.
2. Run `go test ./internal/infrastructure/session/...`.
3. Run `go test ./...` and `go vet ./...` from `api`.
4. Review the diff for secret leakage, unrelated edits, redirect safety, and
   public API clarity.

