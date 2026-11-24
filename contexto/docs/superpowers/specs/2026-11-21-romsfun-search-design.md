# Busca de jogos no RomsFun

## Intenção

Reproduzir somente a busca por nome observada na captura do Burp Suite. O nome do jogo deve ficar em uma variável Python fácil de alterar, e o resultado deve expor a lista JSON devolvida pelo RomsFun.

## Escopo

- Fazer uma única requisição `GET` para `https://romsfun.com/api/search`.
- Enviar o nome completo no parâmetro `s` usando `requests`, deixando a biblioteca cuidar da codificação da URL.
- Imprimir os resultados JSON com caracteres Unicode preservados.
- Validar nome vazio, falhas HTTP/rede e resposta que não seja uma lista.
- Não implementar download, busca incremental por tecla ou raspagem de HTML.
- Não copiar cookies, tokens ou o `cf_clearance` temporário da captura.

## Abordagens

1. **API JSON direta (escolhida):** é o fluxo efetivamente usado pela página, tem resposta estruturada e exige apenas uma chamada.
2. Simular cada tecla: reproduziria as requisições intermediárias da interface, mas geraria tráfego desnecessário sem mudar o resultado final.
3. Raspar a página HTML: seria mais frágil e ignoraria o endpoint JSON já identificado.

## Interface

`search_games(game_name: str, session: requests.Session | None = None) -> list[dict[str, object]]` retorna os resultados. `GAME_NAME` define o termo usado quando o arquivo é executado diretamente.

## Extensão: número de downloads

A API JSON não inclui o contador exibido nos cards. Depois da busca, será feita uma única requisição adicional para `https://romsfun.com/browse-all-roms/` com o mesmo nome no parâmetro `q`. O HTML dessa listagem será usado para mapear a URL de cada jogo ao seu contador e cada resultado receberá `downloads` como inteiro. Quando a listagem falhar ou não contiver um jogo, o campo será `None`; os resultados da busca principal continuam disponíveis.
