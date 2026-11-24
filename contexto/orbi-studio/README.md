# Orbi Studio

Mini app React 19 + TypeScript + Tailwind CSS + SVG para editar o mascote Retrorb.

## Executar

```bash
npm install
npm run dev
```

## O que editar

- Arrastar **quadril, joelho e tornozelo** diretamente no SVG.
- A perna usa uma Bézier quadrática que passa exatamente pelo joelho; os contornos branco/escuro/laranja são desenhados como três traços concêntricos com as mesmas espessuras visuais da cabeça.
- As pernas terminam no tornozelo com pontas arredondadas.
- Mover OLED dentro da cabeça, rotacionar e ajustar escala; olhos e boca transformam com ele.
- 30 olhos, 30 bocas, 30 posições base divididas em 10 sentadas, 10 em pé, 10 deitadas.
- Exportação **JSON** editável e **SVG** visual. O exportador SVG atual usa os olhos/boca clássicos (as configurações variantes permanecem no JSON).

## Limitações

As poses são pontos iniciais para edição manual, não uma solução de cinemática inversa. Algumas poses deitadas necessitam reposicionamento manual para acabamento. Movimento é arrasto direto, não animação por keyframes. A edição precisa e visual são feitas na tela; o arquivo JSON é a fonte de verdade.
