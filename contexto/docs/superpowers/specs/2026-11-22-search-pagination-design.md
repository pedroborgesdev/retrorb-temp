# Paginação da busca — design

## Intenção

Permitir navegar por todos os resultados encontrados sem tornar a busca inicial lenta. Cada fonte avança de forma independente e os seis campos atuais de cada jogo permanecem inalterados.

## Constatações

- RomsFun: 12 resultados por página; usa `/browse-all-roms/page/N/?q=...` e expõe link `Next`.
- RomsPure: 18 resultados por página; usa `/browse-roms/page/N/?q=...&sort=last_update` e expõe link `next page-numbers`.
- RomsGames: a busca observada retorna 48 resultados e não expõe paginação nem URL de próxima página.

## Abordagens consideradas

1. Carregar todas as páginas automaticamente: rejeitada porque uma busca ampla como `pokemon` possui 147 páginas no RomsFun e causaria muitas requisições.
2. Avançar todas as fontes juntas: rejeitada porque as fontes possuem tamanhos e quantidades de página diferentes.
3. Carregar mais por fonte: escolhida porque mantém a primeira resposta rápida e consulta apenas o provedor solicitado.

## Contrato

Cada coletor ganha `search_page(game_name, page=1, session=None)`, retornando `results`, `page` e `has_next`. `search_games()` continua retornando somente a lista para preservar os scripts e seus consumidores atuais.

`GET /api/search?q=...` retorna a primeira página das três fontes. `GET /api/search?q=...&source=romsfun&page=2` consulta somente a fonte escolhida. Cada fonte retorna os campos atuais `label`, `results` e `error`, acrescidos de `pagination: {page, has_next}`.

O frontend mostra `Carregar mais` somente quando `has_next` for verdadeiro, acrescenta os novos cards ao grupo existente e atualiza a contagem para o total carregado. Erro ao carregar outra página não remove resultados já exibidos.

## Validação e limites

- Página deve ser um inteiro positivo.
- Páginas maiores que 1 exigem uma fonte válida.
- A próxima página é determinada pelo link de navegação do HTML, não pelo número de resultados.
- RomsGames informa sempre `has_next: false`; uma solicitação direta de página posterior retorna lista vazia sem acessar a rede.
- Nenhuma nova dependência será adicionada.

