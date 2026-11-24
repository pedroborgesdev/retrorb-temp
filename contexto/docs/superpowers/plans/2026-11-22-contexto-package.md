# Context Package Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar o workspace em `contexto/`, contendo apenas scripts, capturas, testes, documentação e dependências dos quatro provedores.

**Architecture:** Os módulos Python permanecem juntos na raiz de `contexto/` para conservar os imports atuais. Capturas, testes e documentação ficam em subdiretórios; todo o aplicativo Flask e seus artefatos exclusivos são removidos explicitamente.

**Tech Stack:** Python 3, requests e pytest.

**Spec:** `docs/superpowers/specs/2026-11-22-contexto-package-design.md`

## Global Constraints

- Preservar o conteúdo dos oito scripts e das cinco capturas Burp.
- Preservar somente testes e documentação relacionados aos scrapers.
- Remover todo o site Flask e seus documentos exclusivos.
- Não mover `.venv` nem diretórios especiais do ambiente.
- Não usar alvos destrutivos amplos; resolver cada caminho explicitamente.

## Review Focus

- Os oito módulos precisam continuar importáveis ao executar a suíte dentro de `contexto/`.
- Nenhum teste ou dependência do Flask pode permanecer no pacote.
- Nenhuma captura Burp pode ser perdida.
- Planos de busca dinâmica e paginação devem permanecer, pois documentam comportamento dos scrapers.
- A raiz do workspace não deve conservar arquivos comuns do projeto fora de `contexto/`.

---

### Task 1: Montar o pacote `contexto/`

**Files:**
- Move: `*_search.py`, `*_game_page.py` → `contexto/`
- Move: `burpsuite/` → `contexto/burpsuite/`
- Move: testes dos oito scrapers → `contexto/tests/`
- Move: documentação não Flask → `contexto/docs/`
- Create: `contexto/requirements.txt`
- Delete: `app.py`, `templates/`, `static/`, testes e documentos Flask, caches gerados

**Interfaces:**
- Consumes: imports de módulos pelo nome na raiz de execução.
- Produces: pacote executável a partir de `/home/pedroborges/Code/retromancy/contexto`.

- [ ] **Step 1: Registrar o inventário pré-movimento**

Confirmar oito scripts, cinco capturas, oito arquivos de teste dos scrapers e separar documentos Flask dos documentos de provedores.

- [ ] **Step 2: Criar a árvore e mover somente os arquivos preservados**

Criar `contexto/tests` e `contexto/docs`, mover os scripts, `burpsuite`, testes dos scrapers e planos/specs não Flask. O próprio spec e plano desta reorganização também entram em `contexto/docs`.

- [ ] **Step 3: Remover os alvos autorizados**

Remover explicitamente `app.py`, `templates`, `static`, `tests/test_app.py`, `tests/search_js_race_test.js`, documentos Flask, `.superpowers`, `.pytest_cache`, `__pycache__` e diretórios vazios remanescentes.

- [ ] **Step 4: Ajustar as dependências**

Escrever `contexto/requirements.txt` com:

```text
requests>=2.32,<3
pytest>=9,<10
```

- [ ] **Step 5: Verificar o inventário final**

Confirmar que `contexto/` contém exatamente oito scripts, cinco capturas, oito testes, documentação não Flask e requirements; confirmar ausência de `app.py`, `templates`, `static`, Flask e arquivos JavaScript.

- [ ] **Step 6: Executar a suíte no novo diretório**

Run: `cd contexto && PYTHONPATH=../.venv/lib/python3.14/site-packages python3 -m pytest -q`

Expected: todos os 115 testes dos scrapers PASS.

- [ ] **Step 7: Verificar sintaxe**

Run: `cd contexto && python3 -m compileall -q *.py`

Expected: exit code 0 sem saída.
