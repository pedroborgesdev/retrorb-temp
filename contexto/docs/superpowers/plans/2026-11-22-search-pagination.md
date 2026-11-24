# Search Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar carregamento incremental e independente dos resultados de cada provedor.

**Architecture:** Os coletores expõem um resultado paginado sem quebrar `search_games()`. A API aceita uma consulta inicial agregada ou uma página de uma fonte, e o frontend acrescenta cards usando um botão por seção.

**Tech Stack:** Python 3, requests, Flask, pytest, HTML/CSS/JavaScript sem framework.

**Spec:** `docs/superpowers/specs/2026-11-22-search-pagination-design.md`

## Global Constraints

- Preservar exatamente os seis campos atuais de cada resultado.
- Não adicionar dependências.
- Não buscar automaticamente todas as páginas.
- Preservar `search_games(game_name, session=None) -> list[SearchResult]`.

## Review Focus

- `page` vazio, zero, negativo, decimal ou texto deve retornar erro 400 na API.
- Fonte desconhecida deve ser rejeitada antes de chamar qualquer coletor.
- HTML sem link de próxima página deve produzir `has_next = false`, mesmo com uma página cheia.
- Falha ao buscar uma página adicional deve preservar os cards já renderizados.
- Uma nova pesquisa deve zerar o estado de paginação anterior.

---

### Task 1: Coletores paginados

**Files:**
- Modify: `romsfun_search.py`
- Modify: `romspure_search.py`
- Modify: `romsgames_search.py`
- Test: `tests/test_romsfun_search.py`
- Test: `tests/test_romspure_search.py`
- Test: `tests/test_romsgames_search.py`

**Interfaces:**
- Produces: `search_page(game_name: str, page: int = 1, session: requests.Session | None = None) -> SearchPage`
- Preserves: `search_games(game_name: str, session: requests.Session | None = None) -> list[SearchResult]`

- [ ] Escrever testes falhos para URL da página 2, detecção de `Next`, fim da paginação, página inválida e RomsGames sem paginação.
- [ ] Executar os testes dos três coletores e confirmar falha pela ausência de `search_page`.
- [ ] Implementar `SearchPage`, validação, construção das URLs e detecção segura do próximo link.
- [ ] Fazer `search_games` delegar a `search_page` e retornar apenas `results`.
- [ ] Executar os testes dos coletores e confirmar sucesso.

### Task 2: API paginada

**Files:**
- Modify: `app.py`
- Test: `tests/test_app.py`

**Interfaces:**
- Consumes: `search_page(game_name, page)` da Task 1.
- Produces: `GET /api/search?q=<query>[&source=<source>&page=<positive-int>]` com `pagination` por fonte.

- [ ] Escrever testes falhos para metadados da primeira página, despacho de uma única fonte e entradas inválidas.
- [ ] Executar `tests/test_app.py` e confirmar as falhas esperadas.
- [ ] Implementar validação, despacho agregado ou individual e resposta paginada.
- [ ] Executar `tests/test_app.py` e confirmar sucesso.

### Task 3: Carregar mais no frontend

**Files:**
- Modify: `templates/index.html`
- Modify: `static/search.js`
- Modify: `static/styles.css`
- Test: `tests/test_app.py`

**Interfaces:**
- Consumes: `pagination.page` e `pagination.has_next` da Task 2.
- Produces: botão `.load-more` por seção, com acréscimo de cards e estado independente.

- [ ] Escrever teste falho para a presença dos controles de paginação no HTML.
- [ ] Executar o teste e confirmar falha.
- [ ] Adicionar o botão, estilos e lógica incremental preservando cards em caso de erro.
- [ ] Executar a suíte completa e confirmar sucesso.
- [ ] Validar ao vivo RomsFun página 2, RomsPure página 2 e RomsGames sem próxima página.
