# RomsFun Submitted Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o autocomplete do RomsFun pela página real de resultados enviada ao pressionar Enter.

**Architecture:** `romsfun_search.py` fará uma única requisição GET à listagem e transformará cada card HTML no contrato comum. O módulo preservará validações, prazo total e fechamento de sessão existentes.

**Tech Stack:** Python 3, requests, regex, pytest.

**Spec:** [2026-11-22-romsfun-submitted-search-design.md](../specs/2026-11-22-romsfun-submitted-search-design.md)

## Global Constraints

- Manter exatamente os seis campos públicos atuais.
- Usar somente `requests`, sem navegador.
- Não seguir redirects e não aceitar URLs de resultado fora de `romsfun.com`.
- Fazer somente uma requisição HTTP por pesquisa bem-sucedida.

## Review Focus

- HTML sem cards deve retornar lista vazia.
- Cards com URL externa devem ser ignorados.
- Campos ausentes devem resultar em `None`.
- Downloads com separador de milhares devem virar inteiro.
- Redirect da listagem deve produzir erro sem ser seguido.

---

### Task 1: Parser e requisição da busca enviada

**Files:**
- Modify: `romsfun_search.py`
- Modify: `tests/test_romsfun_search.py`

**Interfaces:**
- Produces: `search_games(game_name: str, session: requests.Session | None = None) -> list[dict[str, object]]`

- [x] Reescrever os testes para usar HTML da listagem e exigir uma única chamada a `/browse-all-roms/` com `q`.
- [x] Executar os testes e observar falha contra a implementação de autocomplete.
- [x] Implementar o parser dos cards para os seis campos exatos.
- [x] Remover a chamada e o parser de `/api/search` e o enriquecimento separado.
- [x] Cobrir vazio, URL externa, dados ausentes, erro HTTP e redirect.
- [x] Rodar o teste do módulo e a suíte completa.
- [x] Revisar a mudança contra o capture e o contrato.
