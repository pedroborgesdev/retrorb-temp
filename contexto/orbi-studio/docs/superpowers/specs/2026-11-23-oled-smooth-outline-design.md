# Contorno contínuo do OLED

## Intenção

Corrigir o contorno quebradiço e desuniforme do OLED sem alterar sua posição, tamanho aproximado, cor, espessura, controles ou conteúdo.

## Design aprovado

- Substituir a mistura atual de curvas quadráticas e linhas por um único caminho fechado composto apenas por curvas cúbicas.
- Construir o caminho de forma simétrica, com tangentes alinhadas em todas as transições e no fechamento.
- Manter preenchimento azul-escuro, contorno creme de 11 px e cantos/arremates arredondados.
- Definir o caminho em uma constante compartilhada pelo canvas e pelo SVG exportado, impedindo divergência entre as duas saídas.
- Manter olhos, boca, transformações e máscara circular inalterados.

## Abordagens consideradas

1. **Caminho cúbico compartilhado e simétrico (escolhida).** Entrega continuidade geométrica real e mantém a silhueta orgânica atual.
2. **Retângulo arredondado.** Seria uniforme, mas perderia a curvatura característica da parte inferior do OLED.

