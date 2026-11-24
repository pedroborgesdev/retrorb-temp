# Detalhes da página de jogo do RomsFun

## Intenção

Receber a URL de um jogo já escolhido na busca e retornar seus metadados, imagens e todas as opções de download normal com um link direto e assinado para cada ZIP.

## Saída

- `name`, `description`, `release_date`, `reviews_count`, `stars_rate`, `publisher`.
- `regions` como lista de nomes.
- `icon` como URL.
- `screenshots` como lista de URLs, sem baixar as imagens.
- `downloads` como lista de objetos com `filename`, `type`, `size` e `download_url`.

## Fluxo

1. `GET` na página do jogo para metadados, imagens e URL da área de downloads.
2. `GET` na área de downloads para listar os arquivos normais.
3. Para cada arquivo, `GET` na página da variante e `POST` AJAX com `action=k_get_download` para obter o link assinado mais recente.

Total: `2 + (2 × quantidade de downloads)` requisições. Não consultar reviews escritas, tracking ou conteúdo das imagens. Os links ZIP são temporários e devem ser consumidos perto do momento da consulta.

## Segurança e falhas

Aceitar somente URLs HTTPS do host `romsfun.com`, usar timeout e não copiar cookies da captura. Uma página sem os campos essenciais deve causar erro explícito. Se a renovação AJAX falhar, usar o link assinado presente na página da variante quando disponível.
