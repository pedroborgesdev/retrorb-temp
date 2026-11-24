# OLED Smooth Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o contorno do OLED contínuo, simétrico e uniforme no editor e no SVG exportado.

**Architecture:** Centralizar a silhueta em `OLED_PATH` dentro de `OrbiCanvas.tsx`. O componente React e `svgMarkup` passam a consumir a mesma constante.

**Tech Stack:** React 19, TypeScript 5.7, SVG, Vitest 5

**Spec:** `docs/superpowers/specs/2026-11-23-oled-smooth-outline-design.md`

## Global Constraints

- Contorno creme: 11 px.
- Caminho fechado composto somente por curvas cúbicas.
- Mesma geometria no canvas e no SVG exportado.
- Não alterar conteúdo ou controles do rosto.

## Review Focus

- Transição do topo para as laterais sem quinas.
- Transição das laterais para a base sem quebra de tangente.
- Fechamento do caminho sem emenda visível.
- Editor e exportação usando a mesma geometria.
- Máscara da cabeça sem recortar o contorno em posição padrão.

---

### Task 1: Caminho compartilhado e contínuo

**Files:**
- Modify: `src/OrbiCanvas.test.tsx`
- Modify: `src/OrbiCanvas.tsx`

**Interfaces:**
- Produces: `OLED_PATH: string`
- Consumes: `OLED_PATH` em `OrbiArt` e `svgMarkup`

- [ ] **Step 1: Escrever teste falho**

Verificar que o caminho do OLED usa somente comandos cúbicos, fecha sem segmentos retos/quadráticos e aparece idêntico no canvas e na exportação.

- [ ] **Step 2: Confirmar RED**

Run: `npm test -- --run src/OrbiCanvas.test.tsx`
Expected: FAIL porque `OLED_PATH` ainda não existe e o contorno atual usa `Q` e `L`.

- [ ] **Step 3: Implementar `OLED_PATH` e reutilizá-lo nas duas saídas**

Usar uma silhueta simétrica com tangentes contínuas, preservando aproximadamente os limites atuais de x = ±90 e y = -73…43.

- [ ] **Step 4: Verificar testes, build e imagem**

Run: `npm test -- --run && npm run build`
Expected: 0 falhas e build concluído.

Inspecionar visualmente o OLED padrão e uma transformação com rotação/escala.

