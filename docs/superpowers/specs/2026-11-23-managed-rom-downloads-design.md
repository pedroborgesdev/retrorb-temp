# Downloads gerenciados de ROMs

**Data:** 2026-11-23  
**Status:** aprovado

## Objetivo

Substituir a abertura de links externos por um fluxo de download controlado pela aplicação. No desktop, o arquivo original deve ser salvo sem extração em `roms/`, com progresso e cancelamento na tela Downloads. Na web, o navegador deve iniciar o download imediatamente, sem abrir outra aba e sem trocar de rota.

## Fluxo

1. A tela do jogo envia à camada `api/` apenas a fonte, a URL da página do jogo e o índice do arquivo selecionado.
2. A API local valida a fonte e a URL da página, consulta novamente os detalhes pelo provider e resolve o arquivo pelo índice. A URL remota nunca é aceita diretamente do cliente.
3. `GET /api/download` transmite o arquivo como anexo, preservando o nome seguro e o tamanho quando informado pelo servidor remoto.
4. Na web, um link temporário sem `target` inicia o anexo no próprio documento; a rota permanece inalterada e o gerenciador do navegador assume o arquivo.
5. No desktop, o processo principal do Electron consome o endpoint local, grava primeiro em `roms/<nome>.part`, publica progresso por IPC e renomeia atomicamente ao concluir.
6. O cancelamento aborta a requisição e remove o arquivo parcial. Falhas também removem o parcial e aparecem na interface.

## Contratos

O pedido de download contém `source`, `gameUrl`, `fileIndex`, `title`, `icon`, `filename` e `size`. O estado publicado pelo Electron contém identificador, metadados do jogo, bytes recebidos, total opcional, estado (`queued`, `downloading`, `completed`, `cancelled` ou `failed`), destino e mensagem de erro opcional.

O preload expõe somente `downloadStart`, `downloadCancel`, `downloadList` e `onDownloadChanged`, além dos controles de janela existentes. Nenhum objeto bruto de IPC ou acesso ao sistema de arquivos chega ao renderer.

## Segurança e integridade

- A URL da página precisa pertencer ao domínio do provider.
- A URL de download é obtida do scraper e precisa ser HTTPS, sem credenciais ou caracteres de controle.
- Redirecionamentos remotos são limitados e revalidados; endereços locais, privados, reservados e link-local são recusados.
- Nomes de arquivo passam por normalização de basename, remoção de controles e limite de tamanho.
- Arquivos existentes não são sobrescritos; um sufixo incremental é aplicado.
- Arquivos parciais usam `.part` e são removidos em cancelamento ou falha.
- O arquivo compactado não é extraído.

## Interface

A tela Downloads passa a exibir tarefas reais do desktop, com barra de progresso, bytes, estado, destino quando concluído, botão Cancelar durante a transferência e acesso de volta à página do jogo. Downloads web são disparados imediatamente e não redirecionam para essa tela, pois o navegador não oferece progresso confiável ao aplicativo.

## Compatibilidade

Os providers continuam independentes. O novo endpoint reutiliza o contrato atual de `details()` e trata campos ausentes como indisponíveis. O diretório `roms/` é criado sob a raiz do aplicativo e ignorado pelo Git.
