# Redesign RetroOrb

Implementado a partir da especificação de interface fornecida em 23/11/2026.

## Limite da mudança

Apresentação React/TypeScript com utilitários Tailwind 4. `styles.css` contém somente a entrada Tailwind e tokens compartilhados. Sem dependências novas.

Preservados: `src/api`, `src/hooks`, `src/store`, `src/types`, `src/lib/format.ts`, backend, integrações e persistência. Também foram preservados os parâmetros e handlers de busca, paginação, favoritos, biblioteca e download presentes nas páginas. A comparação dos arquivos protegidos com a cópia anterior não apresentou diferenças.

A Home reaproveita a consulta existente de consoles e os jogos já salvos. A seção “Descubra jogos” só aparece com jogos reais disponíveis. Sem consultas adicionais ou conteúdo simulado na aplicação.

## Apresentação

- Sidebar recolhível; fontes acessíveis no filtro de Explorar e em Configurações.
- Painel regular verde-água na Home, prateleira de consoles e atalhos neutros.
- Cards compartilhados entre pesquisa, biblioteca e favoritos; catálogo de consoles neutro.
- Detalhes com capa maior, hero escuro, galeria, descrição recolhível conforme o espaço ocupado, informações técnicas e arquivos responsivos.
- Temas claro/escuro e preferências existentes preservados. Sem molduras irregulares renderizadas.

## Navegação

Setas movem o foco entre controles, mantendo o item visível. Campos de texto e selects continuam com seu comportamento de teclado nativo. Ctrl+K, Tab/Shift+Tab e Escape estão disponíveis; os modais mantêm e restauram o foco.

Suporte progressivo a gamepads com mapeamento `standard`: direcional/analógico esquerdo, A, B, LB/RB e Menu. Selects entram em seleção com A; cima/baixo alteram a opção usando o evento de interface existente; A/B encerra a seleção. Deadzone 0,55; repetição após 350 ms e a cada 150 ms. Sem animação de rolagem. Layouts desconhecidos mantêm teclado/mouse sem mapeamento presumido, conforme a [documentação Gamepad.mapping](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping).

## Validação

- `npm test`: 18 testes unitários.
- `npm run test:e2e -- --workers=2`: 11 testes de navegador.
- `npm run build`: TypeScript, Vite e compilação Electron.
- Comparação de arquivos protegidos e revisão independente.

Os testes de navegador usam respostas controladas somente nos arquivos de teste para verificar requisições, erros, paginação e ações sem depender dos provedores externos. Incluem responsividade nos dois temas, modais, descrição, foco e gamepad simulado. Um controle físico e o executável Electron não foram exercitados.
