# Automatic Turnstile Sitekey Detection

## Intent

Allow callers to provide only the 2Captcha API key and target page URL. When `TurnstileRequest.SiteKey` is empty, `SessionClient.SolveTurnstile` fetches the page with the client's existing cookies and User-Agent, discovers the public Turnstile sitekey, and submits it to 2Captcha. An explicitly supplied sitekey remains the override.

## Approaches

1. **Automatic fallback inside `SolveTurnstile` (selected):** preserves the current API, reuses the stateful HTTP session, and makes the common call require only `URL`.
2. Separate detection method: clearer phases but forces every caller to coordinate fetch, extraction, and solve.
3. Browser automation: can observe runtime-only configuration but adds a large dependency and is outside this HTTP module's scope.

## Design

- Validate the page URL before fetching.
- When `SiteKey` is empty, call `SessionClient.Get` so redirects, cookies, body limits, cancellation, and User-Agent behavior stay consistent.
- Extract an implicit widget key from a `data-sitekey` attribute first.
- If absent, inspect inline scripts associated with Turnstile and extract a quoted `sitekey` property used by explicit rendering.
- Use the final response URL for the 2Captcha `pageurl` after redirects.
- Return a dedicated `ErrTurnstileSiteKeyNotFound` when valid page HTML has no supported sitekey.
- Never execute or render fetched HTML. Keep the API key in `TwoCaptchaConfig`; no key is written to source or logs.

## Constraints

- Manual `SiteKey` must continue to work without a page fetch.
- Detection must be bounded by the existing 20 MiB response limit and request context.
- Empty, malformed, or unrelated attributes/scripts must not be accepted.
- JavaScript-created sitekeys that exist only after executing remote code remain out of scope.

## Source

Cloudflare's client-side rendering documentation shows implicit widgets using `data-sitekey` and explicit widgets using a `sitekey` option: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
