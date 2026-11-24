# Retromancy — Atomic Archive UI Kit

Sistema de componentes autoral inspirado no retrofuturismo atômico de Fallout. Não é UI oficial e não usa logos/mascotes da franquia.

## Requisitos

- React + TypeScript + Tailwind CSS (Vite recomendado).
- Sem dependências adicionais de UI.
- `fallout.css` complementa Tailwind apenas nos acabamentos retrofuturistas, texturas e variáveis de tema.

## Instalação

Copie `FalloutUI.tsx` e `fallout.css` para `src/components/`, mantendo ambos na mesma pasta. Use `import { FalloutTheme, FalloutGameCard } from "./components/FalloutUI"`. Opcionalmente, copie `Demo.tsx` e `assets/` para testar a vitrine inteira (ajuste os imports para o caminho escolhido).

```tsx
<FalloutTheme theme="vault" texture="grid" worn>
  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
    <FalloutGameCard
      title={game.title}
      image={game.icon}
      source="RomsFun"
      console={game.console}
      size={game.size}
      downloads={game.downloads}
      favorite={isFavorite}
      onFavoriteChange={setIsFavorite}
      onOpen={() => openGame(game)}
    />
  </div>
</FalloutTheme>
```

## Props de tema

- `theme`: `vault` | `wasteland` | `pipboy`
- `texture`: `grid` | `dots` | `scanlines` | `none`
- `worn`: boolean (padrão true)

## Componentes

1. `FalloutTheme` — tokens do tema e texturas
2. `FalloutSectionHeading` — título e numeração técnica
3. `FalloutGameCard` — capa, fonte, console, tamanho, downloads, favorito, ação de abertura
4. `FalloutButton` — `primary` | `secondary` | `danger` | `terminal`
5. `FalloutPanel` — painel com header e serial
6. `FalloutBadge` — etiqueta de estado
7. `FalloutKeycap` — tecla estilo painel industrial
8. `FalloutProgress` — progresso segmentado
9. `FalloutTabs` — navegação horizontal
10. `FalloutInput` — campo de pesquisa
11. `FalloutToggle` — interruptor
12. `FalloutNotice` — comunicado de sistema
13. `FalloutTerminal` — display CRT sem imagem externa

Todas as ações são passadas como props. Os componentes não fazem fetch, requisições, mudanças na API, navegação automática nem downloads por conta própria.

As 6 capas de exemplo foram recortadas exclusivamente da captura fornecida na conversa. Não use estas cópias como fonte de dados do app final; reutilize o campo `image` da sua API.
