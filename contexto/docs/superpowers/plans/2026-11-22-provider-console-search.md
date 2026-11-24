# Provider Console Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `providers_console_search.py`, driven entirely by an enriched definitive console catalog.

**Architecture:** Enrich each provider mapping with validated request metadata, then use a concurrent aggregator that resolves aliases and delegates HTML parsing to existing provider modules. Provider failures remain isolated in the response.

**Tech Stack:** Python 3, requests, concurrent.futures, pytest, JSON

**Spec:** `contexto/docs/superpowers/specs/2026-11-22-provider-console-search-design.md`

## Global Constraints

- Runtime code reads only `contexto/consoles-definitive.json` for console routing.
- Every request is HTTPS, domain-allowlisted, redirect-disabled, and bounded by existing provider timeouts.
- Existing `SearchResult` fields and their optionality remain unchanged.
- Provider ordering follows the catalog even though requests run concurrently.
- One provider failure cannot erase successful results from another provider.

## Review Focus

- RomsFun and RomsPure IDs must map to the exact `console_name` in the definitive catalog.
- RomsGames and WowRoms URLs must remain on their allowlisted domains.
- Page 1 and page 2+ must use the correct path/query pagination form per provider.
- Aliases that differ only by case or whitespace must resolve deterministically; ambiguous aliases must fail before HTTP.
- Duplicate provider entries for one canonical platform must remain independently searchable.

---

### Task 1: Make the definitive catalog self-contained

**Files:**
- Modify: `contexto/consoles-definitive.json`
- Modify: `contexto/tests/test_consoles_definitive.py`

**Interfaces:**
- Consumes: transport metadata in `contexto/consoles.json`
- Produces: validated `providers[].consult` objects consumed by Task 2

- [ ] **Step 1: Add failing catalog-contract tests**

Assert exact consult schema, provider-specific parameters, HTTPS/domain constraints, pagination metadata, and exact lookup agreement with `consoles.json`.

- [ ] **Step 2: Run the focused test and observe missing `consult` failures**

Run: `PYTHONPATH=contexto .venv/bin/pytest contexto/tests/test_consoles_definitive.py -q`

- [ ] **Step 3: Enrich all 255 provider mappings**

Generate deterministic consult objects from the already captured IDs and URLs without changing canonical grouping or source coverage.

- [ ] **Step 4: Run the focused tests**

Run: `PYTHONPATH=contexto .venv/bin/pytest contexto/tests/test_consoles_definitive.py -q`

Expected: PASS.

### Task 2: Implement the provider console aggregator

**Files:**
- Create: `contexto/providers_console_search.py`
- Create: `contexto/tests/test_providers_console_search.py`

**Interfaces:**
- Consumes: `providers[].consult` from Task 1 and existing provider parser modules
- Produces: `search_console(console_name: str, page: int = 1) -> ConsoleSearchResponse`

- [ ] **Step 1: Add failing interface and routing tests**

Cover canonical and alias lookup, invalid input without HTTP, PlayStation 3 provider routes, path/query pagination, stable output order, parser result contract, and partial provider failure.

- [ ] **Step 2: Run the new test file and observe import/interface failure**

Run: `PYTHONPATH=contexto .venv/bin/pytest contexto/tests/test_providers_console_search.py -q`

- [ ] **Step 3: Implement catalog validation, request preparation, provider adapters, concurrency, and CLI JSON output**

Keep request construction generic from `consult`; keep parsing adapters explicit per provider.

- [ ] **Step 4: Run focused and full suites**

Run: `PYTHONPATH=contexto .venv/bin/pytest contexto/tests/test_providers_console_search.py contexto/tests/test_consoles_definitive.py -q`

Run: `PYTHONPATH=contexto .venv/bin/pytest contexto/tests -q`

Expected: all tests pass.
