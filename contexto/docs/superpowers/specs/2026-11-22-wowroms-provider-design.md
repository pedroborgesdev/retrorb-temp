# Provedor WowRoms

## Intenção

Adicionar dois coletores Python para o WowRoms, mantendo exatamente os contratos públicos já usados pelos demais provedores e permitindo que dados externos ausentes sejam representados por `None`.

## Objetivos

- Criar `wowroms_search.py` com busca submetida, paginação e resultados contendo `title`, `url`, `icon`, `console`, `size` e `downloads`.
- Criar `wowroms_game_page.py` com `name`, `description`, `release_date`, `reviews_count`, `stars_rate`, `publisher`, `regions`, `icon`, `screenshots` e `downloads`.
- Representar cada download com `filename`, `type`, `size` e `download_url`.
- Validar URLs de entrada, não seguir redirecionamentos inesperados e tratar respostas do WowRoms como dados não confiáveis.
- Manter todos os campos coletados opcionais. Somente URL inválida ou falha HTTP da página principal é erro fatal.

## Fora do escopo

- Integrar o WowRoms ao Flask nesta etapa.
- Criar busca dinâmica, pois a captura mostra apenas submissão tradicional.
- Inventar dados ausentes. O WowRoms não informa um tipo separado para o arquivo, então `type` será `None`.

## Restrições observadas

- A busca usa `GET https://wowroms.com/en/roms/list?search=<nome>` e `page=<n>` nas páginas seguintes.
- Os cartões expõem título, URL, ícone, console, tamanho e número de downloads.
- A página do jogo expõe os metadados e um caminho AJAX de download.
- O AJAX exige `k`, um timestamp em milissegundos, e `t`, o MD5 textual de `k`.
- A URL direta vem no campo JSON `link`.

## Abordagens consideradas

1. Reproduzir literalmente página do jogo, tela intermediária e AJAX. É fiel ao clique do navegador, mas sempre custa três requisições.
2. Usar o caminho AJAX já presente na página do jogo e consultar a tela intermediária apenas se ele não estiver disponível. Normalmente usa duas requisições e preserva compatibilidade com o fluxo capturado.

A abordagem 2 foi aprovada por reduzir requisições sem mudar o resultado. A tela intermediária permanece como fallback, elevando o total para três requisições somente quando necessário.

## Contratos e erros

`search_games(name)` retorna a primeira página como lista. `search_page(name, page)` retorna `results`, `page` e `has_next`. `get_game_details(url)` retorna sempre todas as chaves do contrato.

Campos ausentes, HTML parcial, JSON secundário inválido ou falha ao resolver o link direto produzem `None` apenas no dado afetado. Nome de arquivo e tamanho continuam disponíveis quando o download direto falhar. URL de entrada inválida, redirecionamento inesperado ou falha ao carregar a página principal geram uma exceção específica do provedor.

