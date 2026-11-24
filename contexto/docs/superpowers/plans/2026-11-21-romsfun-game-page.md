# RomsFun Game Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `romsfun_game_page.py` para coletar detalhes e links diretos de todos os downloads normais de um jogo.

**Architecture:** Um módulo faz todas as chamadas com a mesma `requests.Session`, separa parsing HTML da orquestração HTTP e imprime JSON quando executado diretamente. Parsers usam apenas a biblioteca padrão; `requests` permanece a única dependência externa.

**Tech Stack:** Python 3, `requests`, `pytest`, `html`, `re`.

**Spec:** `docs/superpowers/specs/2026-11-21-romsfun-game-page-design.md`

## Global Constraints

- O nome do arquivo deve ser `romsfun_game_page.py`.
- Não baixar ícone nem screenshots.
- Não consultar reviews escritas.
- Não incluir cookies ou tokens capturados.
- Validar host HTTPS e definir timeout em toda requisição.

## Review Focus

- Página de jogo externa ao RomsFun deve ser rejeitada antes da rede.
- Vários downloads devem manter seus próprios metadados e links.
- HTML incompleto deve falhar com uma mensagem de domínio.
- Falha do AJAX deve usar o link da página da variante, se houver.
- URLs de imagens não devem gerar requisições adicionais.

---

### Task 1: Coletor completo da página do jogo

**Files:**
- Create: `romsfun_game_page.py`
- Create: `tests/test_romsfun_game_page.py`

**Interfaces:**
- Consumes: `GAME_PAGE_URL` ou `get_game_details(game_url, session=None)`.
- Produces: dicionário JSON com metadados, URLs de imagens e lista de downloads.

- [x] **Step 1: Escrever testes falhando**

Cobrir a saída completa com dois arquivos, contagem das requisições, rejeição de host externo e fallback do AJAX.

- [x] **Step 2: Confirmar RED**

Run: `python3 -m pytest tests/test_romsfun_game_page.py -q`

Expected: FAIL porque `romsfun_game_page` ainda não existe.

- [x] **Step 3: Implementar o mínimo necessário**

Adicionar validação de URL, parsers da página do jogo e downloads, renovação AJAX, fallback assinado, entrada principal e erros de domínio.

- [x] **Step 4: Confirmar GREEN**

Run: `python3 -m pytest -q`

Expected: todos os testes passam.

- [x] **Step 5: Verificar captura e integração real**

Run: `python3 -m compileall -q romsfun_game_page.py tests` e `python3 romsfun_game_page.py`.

Expected: a captura produz os valores observados e a execução real retorna todos os campos e downloads.
