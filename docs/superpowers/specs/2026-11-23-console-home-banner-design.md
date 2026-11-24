# Banner de consoles na home

## Intenção

Transformar “Busque jogos por console” em uma chamada visual importante, mais alta e chamativa, mantendo a identidade retrô viva da aplicação.

## Abordagem

Reutilizar `GET /api/consoles`, cujo contrato já entrega `name` e `image`, em vez de criar um endpoint redundante. O banner terá texto e ação à esquerda e até três logos de consoles populares à direita; no celular, as logos aparecem abaixo do texto. Imagens ausentes ou com falha usam um ícone de controle.

## Regras visuais

- Banner laranja, arredondado, com borda fina derivada do preenchimento e textura de grid.
- Altura mínima maior que a chamada atual e largura total da área de conteúdo.
- Título, descrição e botão explícito “Explorar consoles”.
- Logos em cartões sobrepostos, sem prejudicar legibilidade ou foco.
- Estado de carregamento ocupa o mesmo espaço aproximado e falha da API não remove a chamada.

## Fora de escopo

- Novo endpoint de imagens.
- Alterações no catálogo de consoles ou nas URLs salvas no JSON.
- Download ou cache local das imagens externas.

