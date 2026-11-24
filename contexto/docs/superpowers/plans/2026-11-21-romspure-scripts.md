# RomsPure scripts implementation plan

**Goal:** Implement the two RomsPure scripts with output parity with their
RomsFun counterparts and `None` for unavailable information.

**Architecture:** Both scripts use `requests.Session` and pure parsing
helpers. The search parser reads RomsPure result cards and enriches exact
download counts from each game page. The game-page parser reads metadata,
the download option page, a reusable AJAX nonce, and one signed URL per file.

**Tech stack:** Python 3, `requests`, standard-library HTML/JSON/URL parsing,
`pytest`.

## Tasks

1. Add capture-shaped tests for the search card parser, exact download-count
   enrichment, missing values, validation, and HTTP failures.
2. Implement `romspure_search.py` until those tests pass.
3. Add capture-shaped tests for metadata, missing fields, download option
   parsing, nonce reuse, direct ZIP resolution, URL validation, and partial
   AJAX failures.
4. Implement `romspure_game_page.py` until those tests pass.
5. Parse the Burp capture with both implementations, run the full test suite,
   compile both scripts, and perform live smoke tests when network access is
   available.
