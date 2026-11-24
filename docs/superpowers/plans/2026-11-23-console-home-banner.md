# Console Home Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a chamada de consoles na home maior e mais chamativa, usando logos vindas do catálogo existente.

**Architecture:** `HomePage` consumirá `useConsoles()`, selecionará até três plataformas populares com imagem e renderizará um componente local resiliente a falhas. O contrato e a rota da API permanecem inalterados.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, TanStack Query, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-console-home-banner-design.md`

## Global Constraints

- Reutilizar `GET /api/consoles`; não criar endpoint duplicado.
- Exibir no máximo três logos e fornecer fallback visual.
- Preservar navegação por teclado, responsividade e os temas claro/escuro.
- Não tornar `image` obrigatório.

## Review Focus

- Catálogo carregando: banner preserva tamanho e texto.
- Catálogo com erro: chamada continua navegável.
- Imagem nula ou quebrada: fallback aparece sem quebrar layout.
- Tela de 390 px: conteúdo não causa overflow horizontal.
- Logos externas: `referrerPolicy` e tratamento de `onError` permanecem ativos.

---

### Task 1: Banner de consoles da home

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Test: `tests/e2e/launcher.spec.ts`

**Interfaces:**
- Consumes: `useConsoles(): UseQueryResult<ConsoleCatalog>` e `ConsoleEntry.image?: string | null`.
- Produces: banner acessível com link `/consoles`, até três logos e fallback.

- [x] **Step 1: Escrever o teste E2E falhando**

No teste da home, exigir uma região “Busque jogos por console”, três imagens do catálogo e um link “Explorar consoles”; adicionar um caso com imagem ausente/quebrada e verificar ausência de overflow em 390 px.

- [x] **Step 2: Executar o teste e confirmar a falha**

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/pedroborges/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:e2e -- --grep 'home console banner'`
Expected: FAIL porque o banner atual não renderiza as logos nem a ação nomeada.

- [x] **Step 3: Implementar o banner**

Em `HomePage.tsx`, consumir `useConsoles`, priorizar PlayStation 2, Nintendo DS e Game Boy Advance, completar com os primeiros consoles que possuam imagem, e renderizar até três cartões de logo com fallback local.

- [x] **Step 4: Verificar o teste e a suíte**

Run: `npm test && npm run build`
Expected: todos os testes e o build passam.

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/pedroborges/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:e2e`
Expected: 0 falhas e sem overflow nas larguras existentes.

