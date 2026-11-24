# RomsGames scripts implementation plan

**Goal:** Implement search and game-page scripts with strict output parity
and `None` for unavailable data.

**Architecture:** Use `requests.Session` for orchestration and small standard
library parsing helpers. Search cards are enriched from game JSON-LD. Game
metadata is parsed once and every media ID is resolved through the captured
download POST endpoint.

**Tech stack:** Python 3, `requests`, standard library, `pytest`.

## Tasks

1. Add capture-shaped search tests for strict fields, enrichment, missing
   covers, validation, redirects, and request failures.
2. Implement `romsgames_search.py` until the search tests pass.
3. Add capture-shaped game tests for metadata, unavailable fields, multiple
   media IDs, download JSON mapping, partial failures, and URL validation.
4. Implement `romsgames_game_page.py` until the game tests pass.
5. Validate both parsers against the saved Burp responses, run the full test
   suite and compilation, and perform live smoke tests when permitted.
