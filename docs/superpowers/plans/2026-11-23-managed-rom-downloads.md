# Managed ROM Downloads Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Download ROM archives through the local API, saving desktop files into `roms/` with progress/cancel support while web downloads start in place.

**Architecture:** Flask resolves the selected provider file and streams a validated remote attachment. Electron owns disk writes and task state, exposing a narrow IPC bridge. React uses one typed adapter that selects Electron or browser behavior and renders task state.

**Tech Stack:** Python/Flask/requests, Electron 39, React 19, TypeScript, Zustand, Vitest, Playwright, Tailwind CSS.

---

### Task 1: Define and test the download proxy

**Files:**
- Create: `api/downloads.py`
- Modify: `api/server.py`
- Test: `tests/api/test_downloads.py`

1. Add failing tests for source/game URL validation, file-index bounds, safe attachment names, successful streaming, rejected private targets and redirect validation.
2. Run the focused Python tests and confirm the expected failures.
3. Implement the resolver, remote response validator and streaming Flask response.
4. Run the focused tests until green.

### Task 2: Define renderer contracts and browser behavior

**Files:**
- Modify: `src/types/contracts.ts`
- Modify: `src/api/client.ts`
- Modify: `src/api/desktop.ts`
- Modify: `src/api/downloads.ts`
- Test: `src/api/downloads.test.ts`

1. Add failing tests proving browser downloads use an attachment link without `target`, and desktop requests use the IPC adapter.
2. Add typed request/task schemas and an exported API URL builder.
3. Implement the platform adapter and confirm focused tests pass.

### Task 3: Implement Electron download lifecycle

**Files:**
- Create: `electron/download-manager.cts`
- Modify: `electron/main.cts`
- Modify: `electron/preload.cts`
- Test: `electron/download-manager.test.ts`

1. Add failing unit tests for filename sanitization, collision-safe destinations, state transitions, progress and partial-file cleanup.
2. Implement streamed writes using `net.fetch`, `AbortController`, `.part` files and atomic rename.
3. Register authenticated IPC handlers and expose narrow preload wrappers.
4. Run Electron-focused tests and the Electron TypeScript build.

### Task 4: Implement download state and UI

**Files:**
- Create: `src/store/useDownloads.ts`
- Modify: `src/components/DownloadTable.tsx`
- Modify: `src/pages/DownloadsPage.tsx`
- Modify: `src/pages/HomePage.tsx`
- Test: `src/store/useDownloads.test.ts`
- Modify: `tests/e2e/launcher.spec.ts`

1. Add failing tests for task synchronization, progress updates, cancel and desktop/web navigation behavior.
2. Implement the runtime store and Electron event subscription.
3. Update the game download button: desktop starts and navigates to `/downloads`; web starts in place.
4. Replace handoff-only UI with real task cards, progress bars and cancel actions.
5. Remove stale browser-handoff messaging from the home page.

### Task 5: Documentation and verification

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`

1. Ignore `roms/` and document desktop/web behavior.
2. Run Python tests, Vitest, TypeScript/Vite build and Playwright tests.
3. Review security boundaries, error states and changed files; fix any findings.
