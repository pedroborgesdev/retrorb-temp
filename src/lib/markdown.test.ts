import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('markdown parser', () => {
  it('keeps multiline plain text as a single paragraph block', () => {
    const blocks = parseMarkdown('Linha um\nLinha dois\nLinha três');
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'Linha um\nLinha dois\nLinha três' }] },
    ]);
  });

  it('parses headings, lists, blockquotes, horizontal rules, tables, and code fences', () => {
    const sample = [
      '### Visão geral',
      '',
      'Um **clássico** com *exploração* e `SAVE` e ~~removido~~.',
      '',
      '- **Gênero**: RPG',
      '- **Modo**: Um jogador',
      '',
      '1. Escolha o inicial',
      '2. Explore Kanto',
      '',
      '> Edição revisada para portátil.',
      '',
      '| Campo | Valor |',
      '| --- | --- |',
      '| Console | GBA |',
      '',
      '---',
      '',
      '```text',
      'START+SELECT',
      '```',
    ].join('\n');

    const blocks = parseMarkdown(sample);

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'ul',
      'ol',
      'blockquote',
      'table',
      'hr',
      'code',
    ]);
    expect(blocks[0]).toEqual({
      type: 'heading',
      level: 3,
      children: [{ type: 'text', text: 'Visão geral' }],
    });
    expect(blocks[5]).toMatchObject({
      type: 'table',
      headers: [[{ type: 'text', text: 'Campo' }], [{ type: 'text', text: 'Valor' }]],
      rows: [[[{ type: 'text', text: 'Console' }], [{ type: 'text', text: 'GBA' }]]],
    });
    expect(blocks[7]).toEqual({ type: 'code', language: 'text', code: 'START+SELECT' });
  });

  it('allows safe https links and strips unsafe schemes', () => {
    expect(parseInline('Veja [guia](https://example.com/guide) ou [xss](javascript:alert(1)).')).toEqual([
      { type: 'text', text: 'Veja ' },
      { type: 'link', label: 'guia', href: 'https://example.com/guide' },
      { type: 'text', text: ' ou ' },
      { type: 'text', text: 'xss' },
      { type: 'text', text: '.' },
    ]);
  });
});
