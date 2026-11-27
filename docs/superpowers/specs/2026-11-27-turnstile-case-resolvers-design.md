# Turnstile Case Resolvers Design

## Goal

Keep the HTTP session and Turnstile token acquisition reusable while isolating
the site-specific challenge submission flow in a dedicated case package.

## Structure

```text
api/internal/infrastructure/session/
  client.go
  turnstile.go
  cases/
    case.go
    vimm/
      resolver.go
      resolver_test.go
```

The `session` package owns cookies, redirects, request limits, response
metadata, and 2Captcha integration. It does not know how any particular site
accepts a solved token.

The `cases` package defines the narrow session dependency, the common resolver
contract, and the shared result. A site package implements that contract.

## Public contracts

`SessionClient.Do` executes an arbitrary prepared HTTP request with the same
cookie jar, redirect policy, timeout, User-Agent default, and 20 MiB response
limit already used by `Get`. `DoWithRedirectCheck` additionally lets a caller
validate each redirect before the next request is sent. `Get` remains as a
convenience wrapper.

A case resolver receives a context and target URL and returns both the
Turnstile solve metadata and the final page response. Case implementations can
be substituted in callers through the common `Resolver` interface.

## Vimm flow

The Vimm resolver follows the captured browser flow:

1. Ask the generic session solver to solve Turnstile for the target URL. This
   first request also discovers the sitekey and establishes cookies.
2. POST one form field, `cf-turnstile-response`, to the same URL.
3. Send `Origin` and `Referer` headers matching the target.
4. Let the shared session follow Vimm's `303 See Other`, which changes the
   redirected request to GET. Before following any redirect, require HTTPS and
   an allowed Vimm host. The same per-hop policy applies while fetching the
   page for automatic sitekey discovery.
5. Accept only a successful final response that remains on an allowed Vimm
   host.

The Vimm resolver accepts only HTTPS URLs on `vimm.net` or its subdomains. This
prevents `307`/`308` body replay from submitting a paid CAPTCHA token to an
unrelated host and prevents HTTPS-to-HTTP downgrade redirects.

## Errors and testing

Errors wrap their underlying solver or HTTP error and expose sentinels for an
invalid target and an unaccepted challenge. The paid 2Captcha boundary is
replaced in case tests; the real request construction, validation, and result
handling remain under test. The shared HTTP client is tested separately with a
real local server for cookies, form submission, User-Agent, and 303 redirect
behavior.

