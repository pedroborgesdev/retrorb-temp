# Dynamic Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar sugestões dinâmicas agrupadas de RomsFun e RomsGames ao input da aplicação.

**Architecture:** Cada scraper traduz seu endpoint JSON para o contrato comum. Uma rota Flask consulta os dois em paralelo, e o JavaScript apresenta um dropdown cancelável sem interferir na busca completa.

**Tech Stack:** Python 3, requests, Flask, pytest, HTML/CSS/JavaScript sem framework.

**Spec:** `docs/superpowers/specs/2026-11-22-dynamic-search-design.md`

## Global Constraints

- Preservar `search_games()` e `search_page()`.
- Retornar somente os seis campos existentes em cada sugestão.
- Não adicionar dependências.
- Nunca renderizar conteúdo remoto com `innerHTML`.

## Review Focus

- JSON inválido, objeto em vez de array ou itens não-dicionário não podem derrubar o coletor.
- URLs externas ou caminhos de páginas que não sejam jogos não podem chegar ao frontend.
- Resposta antiga não pode substituir sugestões de um texto mais recente.
- Falha de uma fonte deve preservar sugestões da outra.
- Envio do formulário deve fechar o dropdown e continuar usando a busca completa.

---

### Task 1: Coletores de sugestões

**Files:**
- Modify: `romsfun_search.py`
- Modify: `romsgames_search.py`
- Test: `tests/test_romsfun_search.py`
- Test: `tests/test_romsgames_search.py`

**Interfaces:**
- Produces: `search_suggestions(game_name: str, session: requests.Session | None = None) -> list[SearchResult]`

- [ ] Escrever testes falhos para endpoint/parâmetro, contrato exato, campos ausentes, JSON inválido, URL externa e nome vazio.
- [ ] Executar os testes e confirmar falha pela ausência da função.
- [ ] Implementar parsing defensivo e validação de URLs.
- [ ] Executar os testes dos dois coletores e confirmar sucesso.

### Task 2: API de sugestões

**Files:**
- Modify: `app.py`
- Test: `tests/test_app.py`

**Interfaces:**
- Consumes: os dois `search_suggestions()` da Task 1.
- Produces: `GET /api/suggestions?q=<2..120 caracteres>`.

- [ ] Escrever testes falhos para agrupamento, falha parcial e limites da consulta.
- [ ] Executar `tests/test_app.py` e confirmar as falhas esperadas.
- [ ] Implementar despacho paralelo com timeout e erros sanitizados.
- [ ] Executar `tests/test_app.py` e confirmar sucesso.

### Task 3: Dropdown dinâmico

**Files:**
- Modify: `templates/index.html`
- Modify: `static/search.js`
- Modify: `static/styles.css`
- Modify: `tests/search_js_race_test.js`
- Test: `tests/test_app.py`

**Interfaces:**
- Consumes: resposta agrupada de `/api/suggestions`.
- Produces: dropdown após debounce de 300 ms, links diretos para detalhes e cancelamento de respostas antigas.

- [ ] Escrever testes falhos para markup do dropdown e corrida entre consultas.
- [ ] Executar os testes e confirmar falha.
- [ ] Implementar markup, estilos, debounce, AbortController e renderização segura.
- [ ] Executar JavaScript real no DOM simulado e a suíte completa.
- [ ] Validar ao vivo os dois endpoints e a rota Flask.
