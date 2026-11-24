# RomsPure scripts design

## Goal

Create `romspure_search.py` and `romspure_game_page.py` as RomsPure
equivalents of the existing RomsFun scripts. Their output must contain only
the established fields. A field that is not available must be present with
the value `None`.

## Search contract

`search_games(game_name)` returns a list whose items contain exactly:

- `title`
- `url`
- `icon`
- `console`
- `size`
- `downloads`

The RomsPure browse page is requested with `q=<game_name>` and contains the
first five fields. Its displayed download count is abbreviated (for example,
`1.7K`), so each result page is requested to read the exact integer from the
`VideoGame` JSON-LD. A failed or missing enrichment produces
`downloads: None` without discarding the search result.

## Game page contract

`get_game_details(game_url)` returns exactly:

- `name`
- `description`
- `release_date`
- `reviews_count`
- `stars_rate`
- `publisher`
- `regions`
- `icon`
- `screenshots`
- `downloads`

Scalar fields use `None` when absent. Collection fields also use `None` when
the page does not provide the collection. Each available download contains
exactly `filename`, `type`, `size`, and `download_url`; a direct URL that
cannot be resolved is `None`.

Metadata comes from the visible game page, with JSON-LD used for rating data
and safe fallbacks. Screenshots are read only from a screenshots/gallery
section so related-game covers are not mixed into the result.

## Download flow

1. GET the game page and discover the download landing URL.
2. GET the landing page and parse every available file option.
3. POST `action=romspure_get_nonce` once per collection run.
4. For each option, POST `action=app_get_download_link`, `post_id`, `index`,
   and the nonce to resolve the signed ZIP URL.

For `N` files, the normal successful flow uses `3 + N` requests. If the game
has no download landing URL, no download requests are made and `downloads`
is `None`.

## Validation and errors

Only HTTPS URLs hosted by `romspure.cc` are accepted as input or internal
AJAX/page destinations. Blank search terms are rejected before any request.
Failure of the primary search or game-page request raises a domain-specific
error; optional/missing fields and individual download-resolution failures
become `None`.
