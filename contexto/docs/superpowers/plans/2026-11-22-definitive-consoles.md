# Definitive Consoles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a definitive console catalog that merges only provider spellings for the same platform.

**Architecture:** Curate conservative equivalence groups from `consoles.json`, emit the requested JSON contract, and validate total source coverage and explicit non-merging invariants. The artifact is static data; no runtime dependency is added.

**Tech Stack:** JSON, Python 3, pytest

**Spec:** `contexto/docs/superpowers/specs/2026-11-22-definitive-consoles-design.md`

## Global Constraints

- Every provider entry appears exactly once.
- Different hardware and platform variants remain separate.
- Provider names are preserved verbatim in `providers[].console_name`.
- Every `correlative_names` array contains its entry's canonical `name`.
- The output schema is strictly `consoles[].{name,correlative_names,providers}`.

## Review Focus

- Similar names for different hardware must not be merged.
- Spelling and branding variants for identical hardware must be merged.
- No source item may be omitted or duplicated.
- Correlative names must come from source data and be unique.
- Ordering must be deterministic for stable downstream use.

---

### Task 1: Curate and validate the definitive catalog

**Files:**
- Modify: `contexto/consoles-definitive.json`
- Create: `contexto/tests/test_consoles_definitive.py`

**Interfaces:**
- Consumes: provider arrays from `contexto/consoles.json`
- Produces: the exact JSON contract in `contexto/consoles-definitive.json`

- [ ] **Step 1: Add validation tests**

Assert the schema, exact once-only coverage of all provider/name pairs, canonical ordering, mandatory presence of `name` in `correlative_names`, expected merges such as PS2, and expected separations such as Neo Geo versus Neo Geo AES.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `.venv/bin/pytest contexto/tests/test_consoles_definitive.py -q`

Expected: FAIL because the current example artifact omits nearly all input entries.

- [ ] **Step 3: Replace the example with the curated catalog**

Use canonical product names and an explicit conservative mapping. Include singleton platforms unchanged.

- [ ] **Step 4: Run focused and full context tests**

Run: `.venv/bin/pytest contexto/tests/test_consoles_definitive.py -q`

Run: `.venv/bin/pytest contexto/tests -q`

Expected: all tests pass.

- [ ] **Step 5: Verify JSON parsing and report counts**

Run a read-only Python check that prints canonical count and provider coverage totals.
