# Definitive Consoles Design

## Intent

Produce one provider-independent console catalog from `contexto/consoles.json` so consumers can select a canonical platform while retaining each provider's exact spelling.

## Rules

- Every input entry must appear exactly once in the definitive catalog.
- Merge entries only when they identify the same platform or hardware.
- Do not merge related but distinct platforms, revisions, add-ons, arcade boards, emulator targets, or media variants.
- Canonical `name` values use common, readable product names.
- `correlative_names` always contains the canonical `name` and every unique provider spelling. The canonical name is mandatory even when it was not written verbatim by a provider.
- `providers` contains one entry per source occurrence with the provider key and its exact `console_name`.
- Entries available from only one provider still contain their canonical `name` in `correlative_names`.
- A provider may occur more than once in one canonical entry when its own catalog exposes two confirmed regional names for the same hardware; both source categories must remain addressable.
- The output contains only the top-level `consoles` property and the three requested entry properties.

## Important Separations

- Game Boy, Game Boy Color, and Game Boy Advance remain separate.
- Neo Geo, Neo Geo AES, Neo Geo CD, Neo Geo Pocket, and Neo Geo Pocket Color remain separate.
- TurboGrafx-16/PC Engine and TurboGrafx CD/PC Engine CD remain separate.
- Magnavox Odyssey 2 and Philips Videopac are grouped as regional names for the same hardware.
- PlayStation generations and PlayStation Portable/Vita remain separate.
- MAME variants remain separate when a provider names a specific release.

## Approach

Use an explicit, conservative alias map plus normalized exact matching for harmless typography differences. Pure fuzzy matching is rejected because it can collapse different consoles. Fully manual output without validation is rejected because it can silently omit source entries.

## Files

- Input: `contexto/consoles.json`
- Output: `contexto/consoles-definitive.json`
- Validation: `contexto/tests/test_consoles_definitive.py`
