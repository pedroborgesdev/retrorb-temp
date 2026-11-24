# WowRoms Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar os coletores de busca e detalhes do WowRoms com os mesmos contratos opcionais dos provedores existentes.

**Architecture:** Dois módulos independentes usam `requests.Session` injetável e parsers defensivos de HTML/JSON. A busca consulta a listagem paginada; os detalhes resolvem o link direto pelo AJAX presente na página principal e consultam a tela intermediária somente como fallback.

**Tech Stack:** Python 3, `requests`, biblioteca padrão (`re`, `hashlib`, `html`, `urllib.parse`) e `pytest`.

**Spec:** `docs/superpowers/specs/2026-11-22-wowroms-provider-design.md`

## Global Constraints

- Criar somente `wowroms_search.py`, `wowroms_game_page.py` e seus testes; não integrar ao Flask.
- Preservar os nomes e formatos de campos dos demais provedores.
- Todo campo coletado é opcional e usa `None` quando ausente; não inventar `type` a partir do nome do arquivo.
- Somente URL de entrada inválida, redirecionamento inesperado ou falha HTTP da página principal é fatal.
- Usar HTTPS e aceitar somente `wowroms.com` nas URLs de entrada e navegação interna.
- Não adicionar dependências.
- O diretório não contém metadados Git; não há etapas de commit.

## Review Focus

- Cartão com HTML parcial ou URL malformada deve ser ignorado ou preservar os campos válidos sem derrubar toda a busca.
- Página sem resultados e última página devem retornar lista vazia/`has_next=False` sem erro.
- Metadados ausentes, `Year: 0` e `Region: Unknown` devem resultar em `None`.
- Falha ou JSON malformado no AJAX deve preservar filename/size e usar `download_url=None`.
- Caminho AJAX ausente na página principal deve usar a tela intermediária como fallback sem tornar a falha secundária fatal.

---

### Task 1: Busca paginada do WowRoms

**Files:**
- Create: `wowroms_search.py`
- Test: `tests/test_wowroms_search.py`

**Interfaces:**
- Consumes: `requests.Session.get(url, params, headers, timeout, allow_redirects=False)`.
- Produces: `SearchResult`, `SearchPage`, `WowRomsSearchError`, `search_page(game_name: str, page: int = 1, session: requests.Session | None = None) -> SearchPage` e `search_games(game_name: str, session: requests.Session | None = None) -> list[SearchResult]`.

- [ ] **Step 1: Escrever o teste vermelho do contrato da primeira página**

Criar `test_search_returns_exact_contract_from_submitted_list` com um cartão literal da captura. Esperar:

```python
{
    "title": "Pokemon - Versione Rossa (Italy) (SGB Enhanced)",
    "url": "https://wowroms.com/en/roms/nintendo-gameboy/pokemon-versione-rossa-italy-sgb-enhanced/9924.html",
    "icon": "https://wowroms-photos.com/emulators-roms-logo/26/9924/111-111/Pokemon---Versione-Rossa-(Italy)-(SGB-Enhanced).jpg",
    "console": "Nintendo Gameboy",
    "size": "370,52 kb",
    "downloads": 78795,
}
```

Também verificar `GET https://wowroms.com/en/roms/list`, `params={"search": "pokemon"}` e redirecionamentos desativados.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `python3 -m pytest -q tests/test_wowroms_search.py::test_search_returns_exact_contract_from_submitted_list`

Expected: FAIL por módulo `wowroms_search` inexistente.

- [ ] **Step 3: Implementar o contrato mínimo de busca**

Criar os tipos e funções públicas, validação de nome/página, fechamento apenas da sessão criada internamente e parsing limitado aos `<li class="element ...">`. Título/URL identificam o resultado; ícone, console, tamanho e downloads permanecem opcionais.

- [ ] **Step 4: Executar o teste do contrato e confirmar GREEN**

Run: `python3 -m pytest -q tests/test_wowroms_search.py::test_search_returns_exact_contract_from_submitted_list`

Expected: PASS.

- [ ] **Step 5: Escrever testes vermelhos de paginação e robustez**

Adicionar testes para página 2 com `params={"search": "pokemon", "page": 2}`, detecção literal do link seguinte `page=3`, última página sem link seguinte, campos de cartão ausentes como `None`, URL externa/malformada ignorada, nome em branco/página inválida sem requisição e erro/redirecionamento HTTP encapsulado em `WowRomsSearchError`.

- [ ] **Step 6: Executar os novos testes e confirmar RED**

Run: `python3 -m pytest -q tests/test_wowroms_search.py`

Expected: FAIL nos comportamentos ainda não implementados.

- [ ] **Step 7: Implementar paginação e parsing defensivo**

Completar `search_page`, `_has_next_page`, resolução segura de URLs e tratamento específico de `requests.RequestException`. `search_games` delega para a primeira página e devolve apenas `results`.

- [ ] **Step 8: Executar os testes de busca e confirmar GREEN**

Run: `python3 -m pytest -q tests/test_wowroms_search.py`

Expected: todos PASS.

### Task 2: Detalhes e download direto do WowRoms

**Files:**
- Create: `wowroms_game_page.py`
- Test: `tests/test_wowroms_game_page.py`

**Interfaces:**
- Consumes: uma URL de resultado da Task 1 e `requests.Session.get/post`.
- Produces: `DownloadDetails`, `GameDetails`, `WowRomsGamePageError` e `get_game_details(game_url: str, session: requests.Session | None = None) -> GameDetails`.

- [ ] **Step 1: Escrever o teste vermelho de metadados e AJAX direto**

Usar HTML literal da captura com nome, meta description, `Year: 0`, região, ícone, filename, size e `ajaxLinkUrl`. Fixar `_timestamp_ms()` em `1795323958625`; esperar POST com `k=1795323958625`, `t=80e6589ff3db22f9a43a28e8e3ecc0ca`, cabeçalhos AJAX e JSON `{"s": true, "link": "https://dwfiles.wowroms.com/file"}`.

Esperar o objeto completo com `release_date`, reviews, stars, publisher e screenshots como `None`, `regions=["Italy"]` e um download com filename/size capturados, `type=None` e a URL direta.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `python3 -m pytest -q tests/test_wowroms_game_page.py::test_collects_optional_details_and_resolves_direct_download`

Expected: FAIL por módulo `wowroms_game_page` inexistente.

- [ ] **Step 3: Implementar detalhes e resolução AJAX mínimos**

Criar tipos opcionais, validação de `https://wowroms.com`, parsing de metadados e `_timestamp_ms()`. Gerar `t` com `hashlib.md5(str(k).encode()).hexdigest()`, validar o shape do JSON e aceitar a URL direta HTTPS sem exigir que pertença ao WowRoms.

- [ ] **Step 4: Executar o teste principal e confirmar GREEN**

Run: `python3 -m pytest -q tests/test_wowroms_game_page.py::test_collects_optional_details_and_resolves_direct_download`

Expected: PASS com exatamente duas requisições.

- [ ] **Step 5: Escrever testes vermelhos de opcionalidade, fallback e erros**

Adicionar testes para: página principal vazia retornando todas as chaves como `None`; `Year: 0`/`Region: Unknown`; AJAX HTTP/JSON/link inválido preservando o download com URL `None`; ausência de `ajaxLinkUrl` usando o href `Download rom`, GET da tela intermediária e então POST; falha da tela intermediária retornando metadados sem erro; URL de entrada externa rejeitada antes da rede; falha/redirecionamento da página principal gerando `WowRomsGamePageError`.

- [ ] **Step 6: Executar os novos testes e confirmar RED**

Run: `python3 -m pytest -q tests/test_wowroms_game_page.py`

Expected: FAIL nos comportamentos ainda não implementados.

- [ ] **Step 7: Implementar tolerância secundária e fallback**

Consultar a tela intermediária somente quando o caminho AJAX faltar na principal. Qualquer falha após a página principal afeta apenas `downloads`/`download_url`; URLs opcionais malformadas são ignoradas isoladamente. Incluir `main()` consistente com os outros scripts para imprimir JSON de uma URL configurável no código.

- [ ] **Step 8: Executar os testes de detalhes e confirmar GREEN**

Run: `python3 -m pytest -q tests/test_wowroms_game_page.py`

Expected: todos PASS.

### Task 3: Verificação integrada dos dois scripts

**Files:**
- Verify: `wowroms_search.py`
- Verify: `wowroms_game_page.py`
- Verify: `tests/test_wowroms_search.py`
- Verify: `tests/test_wowroms_game_page.py`

**Interfaces:**
- Consumes: interfaces públicas das Tasks 1 e 2.
- Produces: evidência de compatibilidade com a suíte existente e com o fluxo real capturado.

- [ ] **Step 1: Executar a suíte completa**

Run: `PYTHONPATH=.venv/lib/python3.14/site-packages python3 -m pytest -q`

Expected: todos os testes existentes e novos PASS.

- [ ] **Step 2: Verificar sintaxe**

Run: `python3 -m compileall -q wowroms_search.py wowroms_game_page.py`

Expected: exit code 0 sem saída.

- [ ] **Step 3: Testar ao vivo o fluxo aprovado**

Executar `search_page("pokemon", page=2)`, selecionar o resultado capturado `9924.html` e chamar `get_game_details`. Confirmar contrato completo, paginação e link direto HTTPS; relatar separadamente qualquer indisponibilidade externa.

- [ ] **Step 4: Revisar limites do escopo**

Confirmar que `app.py`, templates e JavaScript não foram alterados e que nenhuma dependência foi adicionada.

