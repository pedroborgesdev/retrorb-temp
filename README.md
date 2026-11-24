# Retromancy

Launcher de jogos retrô em React, TypeScript e Tailwind CSS, com uma API Python que reutiliza os provedores existentes em `contexto/`. Funciona no navegador e possui uma janela Electron opcional.

## Executar

Requisitos: Node.js 22.12+ e Python 3.10+.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r api/requirements.txt
.venv/bin/python -m pip install -r scripts/requirements.txt
npm install
npm run dev
```

Abra **http://127.0.0.1:5173**. O comando inicia a interface e a API em conjunto. No Windows, use `.venv\Scripts\python.exe` para instalar as dependências Python; o iniciador detecta esse ambiente automaticamente.

Para abrir a janela desktop durante o desenvolvimento:

```bash
npm run dev:desktop
```

Para compilar e abrir a versão desktop sem o servidor Vite:

```bash
npm run desktop
```

Execute apenas um desses modos por vez. `npm run desktop` compila a aplicação e mantém a API Python local em execução junto com o Electron; não produz um instalador independente nem embute o Python.

Se a porta 5000 já estiver ocupada, crie `.env` a partir de `.env.example` e defina `API_PORT=5050`, ou execute `API_PORT=5050 npm run dev`. O proxy e o iniciador desktop acompanham essa configuração. O comando `desktop` recompila a interface, espera a API ficar disponível e encerra os processos que iniciou quando a janela é fechada.

## Separação das responsabilidades

```text
src/pages e src/components
          ↓
src/api                  cliente HTTP, validação e integrações desktop/download
          ↓
api/                     servidor HTTP Python e registro de provedores
          ↓
contexto/                scripts e capturas existentes, preservados
```

- `src/types/contracts.ts`: contratos TypeScript e validação das respostas com Zod.
- `src/api/client.ts`: único ponto com `fetch`; URL base configurável e erros HTTP.
- `src/api/catalog.ts`: busca e detalhes. Páginas e hooks utilizam essas funções.
- `src/api/downloads.ts`: integração única de downloads para web e desktop.
- `src/api/desktop.ts`: integração opcional com a janela Electron.
- `src/hooks/useCatalog.ts`: cache, cancelamento e paginação independente por fonte.
- `src/store/useLibrary.ts`: biblioteca, favoritos e preferências locais.
- `src/store/useDownloads.ts`: sincronização do progresso e cancelamento no desktop.
- `src/styles.css`: importação do Tailwind e tokens compartilhados. Componentes usam classes Tailwind; não há CSS de componentes.
- `electron/`: janela nativa, preload isolado e permissões restritas.

O frontend não importa os scrapers, não conhece cookies do Burp e não consulta endpoints dos provedores diretamente. Imagens são exibidas pelas URLs fornecidas, e downloads passam pelo endpoint local validado.

## Logo e ícones

As logos originais dos provedores ficam em `src/assets/providers/` (`romsfun.png`, `romspure.png`, `romsgames.png`, `wowroms.png`). O componente `SourceMark` as utiliza na sidebar, na página inicial, nos resultados, nos detalhes e nas configurações. O Vite inclui esses assets no build, sem depender da internet; as imagens mantêm suas proporções e uma superfície escura para legibilidade nos dois temas.

A imagem original é `retromancy.png`, na raiz. Para atualizar todos os ícones depois de trocar essa imagem:

```bash
npm run icons
```

O script `scripts/prepare_icons.py` preserva a transparência e a proporção, centralizando imagens não quadradas. Ele gera em `public/icons/`:

- `retromancy.ico`: ICO multirresolução com 16, 20, 24, 28, 32, 40, 48, 64, 96, 128 e 256 pixels.
- `ico/retromancy-TAMANHO.ico`: um ICO separado para cada tamanho acima.
- `favicon.ico`: versões de 16, 32 e 48 pixels no mesmo arquivo.
- `retromancy-TAMANHO.png`: tamanhos de 16 a 1024 pixels, incluindo 180 para Apple touch icon e 192/512 para web manifest.
- `retromancy.icns`: ícone para empacotamento no macOS.
- `site.webmanifest` e `generated.json`: manifest web e inventário com hash da origem.

ICO tem dimensões de até 256 pixels por entrada; versões maiores são PNG/ICNS. A geração ocorre automaticamente antes de `npm run build` e de `npm run dev:web`. O Vite copia esses arquivos para `dist/icons/`. A interface, o favicon e a janela Electron já usam os arquivos gerados; placeholders de capas de jogos continuam usando o ícone de gamepad.

Para uma origem ou pasta diferente: `npm run icons -- --source outra-logo.png --output outra-pasta`. Apenas o destino padrão está ligado automaticamente à interface. A geração sobrescreve os arquivos gerados de mesmo nome, sem modificar a logo original ou limpar arquivos extras da pasta.

Para um futuro empacotador de instaladores, use `public/icons/retromancy.ico` no Windows, `public/icons/retromancy.icns` no macOS e `public/icons/retromancy-512.png` no Linux. Definir o ícone da janela não altera, sozinho, o ícone de um executável/instalador; o empacotador deve receber esses caminhos. O projeto ainda não gera instaladores.

## Funcionalidades

- Pesquisa ao digitar, com debounce de 450 ms e cancelamento das consultas anteriores.
- Consultas independentes a RomsFun, RomsPure, RomsGames e WowRoms. O app faz uma consulta por fonte habilitada para mostrar as respostas assim que chegam.
- Cache de pesquisa de cinco minutos, retido por até trinta minutos enquanto inativo. Paginação, erros e tentativas adicionais ficam isolados por fonte.
- Catálogo de consoles na sidebar e na home, com plataformas populares no topo e cards gerados pelo JSON definitivo.
- Abas de fontes, seleção de console pelo nome oficial, ordenação por nome/tamanho/downloads e visualização em grade ou lista. A ordenação considera os resultados carregados; a seleção de console é enviada à API e preservada na URL.
- Detalhes com descrição, metadados disponíveis, capa, screenshots e tabela de arquivos.
- Galeria com modal, navegação por setas, foco contido e fechamento com Escape.
- Biblioteca local, cadastro manual e favoritos. Jogos salvos com detalhes continuam exibindo esses metadados se a fonte falhar; links de downloads salvos ficam desabilitados até uma consulta bem-sucedida.
- Tema claro/escuro, cores de destaque, densidade, tamanho de cards e fontes habilitadas persistidos localmente.
- Atalhos Ctrl/Cmd+K, Alt+← e Alt+→. Apenas o conteúdo central tem rolagem; sidebar e barras permanecem visíveis.
- Electron com controles reais da janela. No navegador, a barra identifica a edição web e não apresenta controles de janela inoperantes.

Não existem dados de demonstração no aplicativo. Os estados iniciais refletem uma biblioteca vazia; o banner é uma apresentação do produto, não uma recomendação de jogos.

## API

`VITE_API_BASE_URL` configura a URL da API, incluindo `/api`. Quando vazia, usa `/api` por meio do proxy Vite; no Electron compilado, usa `http://127.0.0.1:PORTA/api`, com a porta de `API_PORT` definida no build (5000 por padrão). `API_PROXY_TARGET` pode substituir o destino do proxy. `CORS_ORIGINS` configura origens adicionais explicitamente autorizadas, separadas por vírgulas. A API foi feita para uso local, vinculada a `127.0.0.1`.

```http
GET /api/search?q=Pokemon
GET /api/search?q=Pokemon&source=wowroms&page=2
GET /api/consoles
GET /api/search?console=PlayStation%203&q=&source=romsfun&page=1
GET /api/search?console=PlayStation%203&q=God%20of%20War
GET /api/game?source=wowroms&url=URL_CODIFICADA
GET /api/download?source=wowroms&url=URL_CODIFICADA&file=0&filename=ARQUIVO.zip
GET /api/health
```

Os contratos de busca e detalhes estão em `src/types/contracts.ts` e mantêm os campos do contexto original. Dados ausentes continuam sendo `null`. A API não remove campos opcionais nem acrescenta metadados fictícios.

Uma falha na busca de uma fonte retorna HTTP 200 com `sources[fonte].error`, sem impedir os demais resultados. Erros de entrada retornam 400 e falhas nos detalhes retornam 502, com `{"error": "mensagem"}`. A busca aceita até 200 caracteres e páginas de 1 a 500; o texto pode ser vazio quando há um console selecionado. As URLs de detalhes devem ser HTTPS do domínio da fonte selecionada.

`GET /api/consoles` devolve todo o conteúdo de `contexto/consoles-definitive.json`. A busca por console, com ou sem texto, usa `providers_console_search.py` e as rotas/parâmetros do JSON. `consult.search.param` define o parâmetro do título (`q` ou `search`). RomsFun envia `q` + `consoles[]`; RomsPure envia `q` + `console` (ID) + `console_opts[]`; WowRoms envia `search` na rota do console. RomsGames não aceita título nessa rota: `consult.search.url` indica a busca global não paginada, e os links dos jogos são filtrados por plataforma antes do enriquecimento. O filtro final por `correlative_names` permanece ativo. Em cards sem console, RomsGames/WowRoms só recuperam o nome quando a URL do próprio jogo corresponde à plataforma mapeada. Paginação e erros continuam independentes por fonte.

Uso direto: `search_console("PS2", query="black", source="romsfun", page=1)`. No script, configure `CONSOLE_NAME` e o `GAME_NAME` opcional; título vazio lista o catálogo do console.

Para adicionar uma imagem de console, coloque o arquivo em `public/images/consoles/` e acrescente, por exemplo, `"image": "images/consoles/sega-lindbergh.png"` ao console correspondente no JSON. O caminho relativo funciona na web e no desktop. O campo pode ser omitido ou ser `null`; referências indisponíveis também exibem um placeholder. Os populares são ordenados editorialmente em `src/pages/ConsolesPage.tsx`, e os demais aparecem em ordem alfabética.

O cancelamento no navegador interrompe a espera e impede respostas antigas de substituírem a busca atual. Uma requisição já recebida pelo servidor pode continuar executando o scraper até seu timeout; os scripts Python permanecem síncronos.

## Downloads e dados locais

O botão **Baixar** nunca abre uma aba externa. Na edição web, ele inicia o anexo pelo próprio navegador e mantém a página do jogo aberta; o progresso e o cancelamento continuam sob responsabilidade do navegador.

No Electron, o processo principal baixa o pacote pela API local e salva o arquivo original, sem extração, em `roms/` na raiz do projeto. A tela **Downloads** mostra bytes recebidos, porcentagem quando o tamanho é conhecido, conclusão, falha e destino. **Cancelar** aborta a transferência e remove o arquivo parcial. Downloads simultâneos com o mesmo nome recebem sufixos e arquivos existentes não são sobrescritos. Durante a transferência é usado um arquivo oculto `.part`; ele só vira o nome final após o término íntegro.

`GET /api/download` recebe fonte, URL da página, índice e nome esperado. A API consulta novamente o provider, recusa listas que mudaram, valida cada destino HTTPS e redirecionamento contra redes locais/privadas, preserva cookies da consulta e transmite o conteúdo como anexo. O frontend não envia uma URL remota arbitrária para o proxy.

A biblioteca usa `localStorage` do perfil atual. Navegador e Electron têm armazenamentos separados. Limpar os dados do perfil remove os registros. Capas e screenshots são URLs, não arquivos armazenados offline. O aplicativo só baixa um pacote após ação explícita no botão **Baixar** e não contorna proteções dos provedores.

## Identidade visual e molduras

`contexto/color-catalogue.json` é a fonte das cores. `src/lib/colors.ts` transforma o catálogo em tokens semânticos para Tailwind. A base escura é preto/cinza neutro (`#181818` / `#222222`), sem tonalidade azul. Os painéis irregulares do topo têm contorno branco; os arredondados usam borda fina num tom mais claro do próprio preenchimento. A home usa turquesa `#19D8BD`. A identidade parte das cores da logo, intensificadas para um visual lúdico de papel recortado.

`src/components/PaperFrame.tsx` é a moldura reutilizável. A geometria usa recortes em pixels para manter o aspecto retangular em diferentes proporções; apenas as camadas decorativas são recortadas, preservando conteúdo e indicadores de foco.

```tsx
<PaperFrame
  palette="teal"
  shape="paper"
  profile="steps"
  cut={20}
  irregularity={8}
  borderWidth={6}
  texture="dots"
  patternSize={22}
  padding="md"
>
  Conteúdo
</PaperFrame>
```

- `shape`: `paper` fica restrito ao painel principal do topo de cada página; os demais usam `rounded` (padrão), com cantos regulados por `radius`. `cut` e `ticket` continuam disponíveis no utilitário geométrico.
- `profile`: `classic`, `steps`, `slant` e `torn` mudam a posição e a quantidade dos recortes de `paper`. `cut` ajusta os cantos e `irregularity` a profundidade das irregularidades, sem sorteio a cada renderização.
- `surface`: `vivid` mantém preenchimento colorido e opaco com texto escuro; `theme` mantém os tokens do tema e usa `card_jogo` do JSON (`#2B2B2B` no escuro e `#E8E8E8` no claro). Os cards de jogos usam `rounded`, `surface="theme"` e `texture="none"`, inclusive nos favoritos.
- `palette`: chave de `retroColors`; `color`, `dotColor` e `paperColor` permitem sobrescritas pontuais.
- `borderWidth`, `texture` (`dots`, `grid`, `none`) e `patternSize`: espessura e textura. Os painéis irregulares mantêm bordas brancas de 6–7 px; os arredondados usam 3 px e uma mistura opaca de 75% do preenchimento com 25% de branco, acompanhando a cor e o tema. Bolinhas e grid cartesiano alternam nos painéis coloridos; cards de jogos não têm textura. Somente a textura tem opacidade; a cor de fundo permanece 100% preenchida.
- `padding`: `none`, `sm`, `md`, `lg`; `className` e `contentClassName` personalizam layout via Tailwind.

As molduras aparecem na home, títulos das páginas, catálogo de consoles, grupos de fontes, cards de jogos, detalhes, arquivos, capturas, estados vazios, erros, avisos e modais. Tabelas e campos mantêm superfícies simples para legibilidade. A geometria e as cores dinâmicas são passadas por variáveis CSS; a estilização permanece em Tailwind.

## Verificação

```bash
npm run build
npm test
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=contexto .venv/bin/python -m pytest contexto/tests tests/api -q -p no:cacheprovider
npx playwright install chromium
npm run test:e2e
```

Para usar um Chromium já instalado, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE` com o caminho do executável. Os testes de navegador usam respostas controladas apenas dentro de `tests/e2e`, para verificar falhas, campos nulos, persistência, galeria, corridas de busca e paginação sem depender da disponibilidade de terceiros.

Referências técnicas usadas: [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite), [paginação do TanStack Query](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useInfiniteQuery) e [segurança no Electron](https://www.electronjs.org/docs/latest/tutorial/security/).
