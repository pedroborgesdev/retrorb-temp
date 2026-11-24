# RomsFun Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um script Python que pesquisa um nome de jogo no endpoint JSON do RomsFun e imprime a lista encontrada.

**Architecture:** Um único módulo contém a variável editável, a função testável de busca e a entrada de linha de comando. A dependência HTTP pode ser injetada nos testes para que nenhuma chamada externa seja feita durante a suíte.

**Tech Stack:** Python 3, `requests`, `pytest`.

**Spec:** `docs/superpowers/specs/2026-11-21-romsfun-search-design.md`

## Global Constraints

- Usar `GET https://romsfun.com/api/search` com o nome no parâmetro `s`.
- Não incluir cookies, tokens nem lógica de download.
- Sempre definir timeout para a chamada externa.

## Review Focus

- Nome vazio deve ser rejeitado antes de qualquer chamada de rede.
- Espaços externos devem ser removidos sem alterar espaços internos ou Unicode.
- Erros HTTP/rede devem produzir uma mensagem de domínio compreensível.
- JSON que não seja uma lista deve ser rejeitado como resposta inesperada.
- Uma lista vazia válida deve ser retornada sem erro.

---

### Task 1: Busca e apresentação dos resultados

**Files:**
- Create: `romsfun_search.py`
- Test: `tests/test_romsfun_search.py`

**Interfaces:**
- Consumes: endpoint público observado na captura e uma `requests.Session` opcional.
- Produces: `search_games(game_name: str, session: requests.Session | None = None) -> list[dict[str, object]]` e `main() -> int`.

- [x] **Step 1: Escrever testes falhando**

Testar a chamada parametrizada e o retorno, nome vazio, normalização de espaços/Unicode, erro HTTP, payload inválido e lista vazia.

- [x] **Step 2: Confirmar RED**

Run: `python3 -m pytest tests/test_romsfun_search.py -q`

Expected: FAIL porque `romsfun_search` ainda não existe.

- [x] **Step 3: Implementar o mínimo necessário**

Criar as constantes, `RomsFunSearchError`, `search_games()` e `main()`. Usar `params={"s": termo}`, timeout, `raise_for_status()` e validação do tipo superior do JSON.

- [x] **Step 4: Confirmar GREEN e a suíte completa**

Run: `python3 -m pytest -q`

Expected: todos os testes passam sem warnings.

- [x] **Step 5: Verificar o script**

Run: `python3 -m compileall -q romsfun_search.py tests`

Expected: exit code 0.

- [x] **Step 6: Commit**

O diretório não é um repositório Git válido; registrar essa limitação no handoff em vez de criar um commit.

### Task 2: Enriquecer resultados com downloads

**Files:**
- Modify: `romsfun_search.py`
- Modify: `tests/test_romsfun_search.py`

**Interfaces:**
- Consumes: lista produzida por `search_games()` e cards HTML de `GET /browse-all-roms/?q=<nome>`.
- Produces: os mesmos dicionários, copiados e acrescidos de `downloads: int | None`.

- [x] **Step 1: Escrever testes falhando**

Testar a associação por URL, conversão de `180,509` para `180509`, ausência de contador e falha HTTP somente na listagem.

- [x] **Step 2: Confirmar RED**

Run: `python3 -m pytest tests/test_romsfun_search.py -q`

Expected: FAIL porque os resultados ainda não possuem `downloads` e não há segunda requisição.

- [x] **Step 3: Implementar o mínimo necessário**

Consultar a listagem uma vez, extrair URL e contador dos cards, copiar cada resultado e adicionar `downloads`. Preservar a busca principal quando o enriquecimento falhar.

- [x] **Step 4: Confirmar GREEN e integração**

Run: `python3 -m pytest -q`

Expected: todos os testes passam.

- [x] **Step 5: Verificar o script**

Run: `python3 -m compileall -q romsfun_search.py tests` e `python3 romsfun_search.py`.

Expected: exit code 0 e cada resultado real contém `downloads`.
