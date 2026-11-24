# Provider Console Search Design

## Intent

Add a standalone Python console-search aggregator driven entirely by `consoles-definitive.json`. A canonical console or alias resolves to the provider-specific console listing for every mapped provider.

## Catalog Contract

Every `providers[]` item keeps `name` and `console_name` and gains `consult`:

- `method`: always `GET` for the current providers.
- `url`: the first-page HTTPS listing or filter endpoint.
- `params`: provider-specific static query parameters, including the console filter ID where required.
- `pagination.mode`: `path` or `query`.
- Path pagination supplies `url_template` containing `{page}`.
- Query pagination supplies `page_param`.

`consoles.json` is generation evidence only. Runtime searches read only `consoles-definitive.json`.

## Public Interface

`search_console(console_name: str, page: int = 1) -> ConsoleSearchResponse`

- Resolves `console_name` case-insensitively against canonical `name` and every `correlative_names` value.
- Rejects blank, unknown, ambiguous, or invalid-page input before making requests.
- Queries all mapped provider entries concurrently while preserving catalog order in the response.
- A provider failure returns an empty result list and a public error string without discarding successful providers.
- Each game keeps the shared `title`, `url`, `icon`, `console`, `size`, and `downloads` contract.

Response shape:

```json
{
  "name": "PlayStation 3",
  "page": 1,
  "providers": [
    {
      "name": "romsfun",
      "console_name": "PS3",
      "results": [],
      "has_next": false,
      "error": null
    }
  ]
}
```

## Provider Routing

- RomsFun: `consoles[]` numeric filter; page 2+ uses `/page/{page}/`.
- RomsPure: `console_opts[]` numeric filter plus its stable sort fields; page 2+ uses `/page/{page}/`.
- RomsGames: console listing URL; pagination uses the `page` query parameter.
- WowRoms: console listing URL; pagination uses the `page` query parameter.

Provider result parsing reuses the existing tested parsers. Console-filter HTTP routing and pagination are owned by `providers_console_search.py`.

## Safety and Failure Semantics

- Consult URLs must be HTTPS and match the allowlisted domain for their provider before any request.
- Redirects are not followed.
- JSON structure and consult fields are validated at the boundary.
- Internal exception details are not exposed in the returned payload.

## Non-goals

- No Flask or React integration in this change.
- No download resolution or game-detail requests beyond enrichment already required by the existing result contract.
- No mutation of the catalog at runtime.

## Approach

Use one aggregator with small provider adapters and reuse the current HTML parsers. Duplicating all parsers in the new script would drift from existing behavior; forcing console filters through title-search functions would not perform a real console listing.
