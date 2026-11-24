# SDD ledger — plan: /home/pedroborges/Code/retromancy/contexto/orbi-studio/docs/superpowers/plans/2026-11-23-orbi-leg-foot.md

Setup ruling: o workspace não é um repositório Git válido (`.git` está vazio), portanto não é possível criar worktree, obter BASE, usar os scripts SDD dependentes de Git ou criar commits. Execução autorizada no diretório solicitado pelo usuário; custo se errado: não há isolamento nem histórico Git local para reverter esta alteração.

Baseline: `npm run build` → exit 0.

Pre-flight: Task 1 produz `footGeometry`, `moveFootCenter`, `rotateFoot` e `moveAnkleWithFoot`; Task 2 consome exatamente essas interfaces. Sem conflito.

Task 1: Ruling: o Vitest não está disponível no `node_modules` do miniapp e a instalação offline falhou com `ENOTCACHED`; usar o Vitest 3.2.7 já instalado no workspace raiz pelo script `node ../../node_modules/vitest/vitest.mjs` evita download e mantém testes locais reproduzíveis dentro deste workspace — custo se errado: executar o miniapp isoladamente, fora do monorepo atual, exigirá instalar Vitest e ajustar o script.

Task 1: complete (sem commits: workspace não é Git; tests: `npm test -- --run src/geometry.test.ts` → 5 passed, 0 failed).

Task 2: Ruling: a instalação de navegador do Playwright não existe; usei o Firefox 156 já instalado, via geckodriver local, para inspecionar as poses sentada, em pé e deitada, com controles ligados e desligados — custo se errado: a inspeção não cobre diferenças específicas de renderização do Chromium.

Task 2: complete (sem commits: workspace não é Git; verification: `npm run build && npm test -- --run` → build exit 0, 8 passed, 0 failed; inspeção visual em poses sentada, em pé e deitada).

Override do usuário: a solução de cápsula foi cancelada; remover completamente os pés passou a ser a especificação vigente. Os documentos antigos de design/plano foram excluídos por estarem obsoletos.

Final: remoção concluída no tipo `Leg`, estado inicial, 30 poses, canvas, controles, painel, importação e SVG exportado. JSON legado é normalizado por lista permitida e descarta `heel`/`toe`.

Final: fixed validação fraca/injeção no SVG — testes `drops legacy foot points while preserving the body`, `rejects missing points and non-numeric coordinates` e `rejects non-numeric coordinates instead of emitting injected markup` RED→GREEN; suite 8/8.

Final: a dependência de testes foi instalada localmente e atualizada para Vitest 5.1.1 após auditoria da versão 3.2.7; `npm audit` → 0 vulnerabilidades.

Final verification: `npm test -- --run && npm run build` → 8 passed, build exit 0. Inspeção visual Firefox: personagem sem pés e sem controles residuais.

