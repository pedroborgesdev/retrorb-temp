# RomsFun Submitted Search Design

## Intent

Fazer `romsfun_search.py` reproduzir a pesquisa enviada pelo formulário do RomsFun, em vez da API de sugestões exibidas enquanto o usuário digita.

## Approaches

- Escolhido: requisitar `GET /browse-all-roms/` com o parâmetro `q` e extrair os cards do HTML. É o fluxo posterior ao Enter e entrega os dados visíveis da listagem em uma requisição.
- Rejeitado: continuar usando `/api/search` e validar os resultados na listagem. Ainda faria a fonte primária ser o autocomplete e exigiria duas requisições.
- Rejeitado: automação de navegador. É desnecessária porque o formulário usa uma requisição GET reproduzível com `requests`.

## Contract

`search_games(game_name, session=None)` continua retornando estritamente `title`, `url`, `icon`, `console`, `size` e `downloads`. Campos que a listagem não informar ficam `None`; em especial, `console` não será inferido pelo slug. URLs externas são ignoradas, redirects não são seguidos e uma busca vazia continua sendo rejeitada antes da rede.

## Requests

Uma única requisição por busca: `GET https://romsfun.com/browse-all-roms/?q=<nome normalizado>`. Não haverá chamada a `/api/search` nem requisição separada para enriquecer downloads.
