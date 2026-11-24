# Pacote de contexto dos provedores

## Objetivo

Transformar o workspace em um pacote autocontido chamado `contexto/`, preservando tudo que explica ou executa as requisições aos quatro provedores e removendo o aplicativo web Flask.

## Estrutura escolhida

- `contexto/*.py`: os oito scripts de busca e detalhes.
- `contexto/burpsuite/`: as capturas de pesquisa, paginação e download.
- `contexto/tests/`: somente os testes dos scrapers.
- `contexto/docs/`: planos e especificações relacionados aos provedores, busca e paginação.
- `contexto/requirements.txt`: somente dependências necessárias aos scripts e testes (`requests` e `pytest`).

## Remoções autorizadas

- `app.py`, `templates/` e `static/`.
- Testes exclusivos do site: `tests/test_app.py` e `tests/search_js_race_test.js`.
- Documentos e ledgers exclusivos do Flask.
- Caches Python e pytest gerados.

## Abordagens consideradas

1. **Pacote completo organizado** — escolhida: preserva scripts, capturas, testes e documentação técnica para outra IA compreender e validar os fluxos.
2. Pacote mínimo apenas com scripts e Burp — rejeitada porque perderia contratos executáveis e decisões úteis de parsing.

## Verificação

Após a reorganização, nenhum arquivo do site deve permanecer fora ou dentro de `contexto/`; imports e testes devem funcionar executados a partir de `contexto/`; o inventário final deve conter somente material de requisições e suporte aos scrapers.
