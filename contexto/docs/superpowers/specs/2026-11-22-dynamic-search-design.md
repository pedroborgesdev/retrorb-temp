# Pesquisa dinâmica — design

## Intenção

Exibir sugestões de jogos enquanto o usuário digita, utilizando os endpoints dinâmicos nativos de RomsFun e RomsGames, sem substituir a busca completa, paginada e agrupada dos três provedores.

## Comportamento aprovado

- A partir de 2 caracteres, aguardar 300 ms sem nova digitação antes de consultar.
- Mostrar um dropdown agrupado por RomsFun e RomsGames.
- Clicar em uma sugestão abre diretamente `/game` com a fonte e URL correspondentes.
- Enviar o formulário continua executando `/api/search` e exibindo a busca completa com paginação.
- Fechar sugestões ao enviar, apagar o texto, pressionar Escape ou clicar fora da área de pesquisa.

## Coletores

- `romsfun_search.search_suggestions()` consulta `GET https://romsfun.com/api/search?s=<nome>`.
- `romsgames_search.search_suggestions()` consulta `GET https://www.romsgames.net/search/hint/?q=<nome>`.
- Ambos retornam exatamente os seis campos atuais: `title`, `url`, `icon`, `console`, `size`, `downloads`.
- Campos ausentes no endpoint são `None`. Portanto, downloads é `None` nos dois; size também é `None` no RomsGames.
- URLs externas, registros malformados, tipos que não sejam ROM e ícones `no-cover` são descartados ou convertidos para `None` conforme apropriado.

## API

`GET /api/suggestions?q=<nome>` consulta os dois provedores em paralelo e retorna:

```json
{
  "query": "pokemon",
  "sources": {
    "romsfun": {"label": "RomsFun", "results": [], "error": null},
    "romsgames": {"label": "RomsGames", "results": [], "error": null}
  }
}
```

Consultas menores que 2 caracteres ou maiores que 120 caracteres recebem 400. Falha de um provedor não elimina os resultados do outro, e detalhes internos da exceção não são expostos.

## Concorrência e interface

O navegador cancela a requisição anterior quando o texto muda e ignora respostas antigas. O dropdown usa nós DOM e `textContent`, sem inserir HTML retornado pelos provedores. Imagens aceitam somente HTTP/HTTPS pelo validador existente. O estado do autocomplete é independente do estado de paginação.

