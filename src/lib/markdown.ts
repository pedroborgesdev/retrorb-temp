import { safeUrl } from './format';

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'del'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; href: string };

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'ul'; items: InlineNode[][] }
  | { type: 'ol'; items: InlineNode[][] }
  | { type: 'blockquote'; lines: InlineNode[][] }
  | { type: 'hr' }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; headers: InlineNode[][]; rows: InlineNode[][][] };

const INLINE_PATTERN =
  /`([^`\n]+)`|\[([^\]\n]+)\]\(((?:[^()\s]+|\([^()\s]*\))+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, index) });
    }

    if (match[1] !== undefined) {
      nodes.push({ type: 'code', text: match[1] });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const safe = safeUrl(match[3]);
      if (safe) {
        nodes.push({ type: 'link', label: match[2], href: safe });
      } else {
        nodes.push({ type: 'text', text: match[2] });
      }
    } else if (match[4] !== undefined || match[5] !== undefined) {
      nodes.push({ type: 'strong', text: match[4] ?? match[5] });
    } else if (match[6] !== undefined) {
      nodes.push({ type: 'del', text: match[6] });
    } else if (match[7] !== undefined || match[8] !== undefined) {
      nodes.push({ type: 'em', text: match[7] ?? match[8] });
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return nodes.length ? nodes : [{ type: 'text', text }];
}

const HEADING_RE = /^\s*(#{1,4})\s+(.+?)\s*#*$/;
const HR_RE = /^\s*(?:---+|___+|\*\*\*+)\s*$/;
const UL_RE = /^\s*[-*+]\s+(.+)$/;
const OL_RE = /^\s*\d+\.\s+(.+)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^\s*```([\w-]*)\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)*\s*\|?\s*$/;

function splitTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isBlockStart(line: string, nextLine: string | undefined): boolean {
  if (!line.trim()) return true;
  if (FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line)) return true;
  if (UL_RE.test(line) || OL_RE.test(line) || QUOTE_RE.test(line)) return true;
  if (line.includes('|') && nextLine !== undefined && TABLE_SEP_RE.test(nextLine)) return true;
  return false;
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const normalized = source.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const language = fenceMatch[1] || '';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4;
      blocks.push({ type: 'heading', level, children: parseInline(headingMatch[2].trim()) });
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (line.includes('|') && lines[i + 1] !== undefined && TABLE_SEP_RE.test(lines[i + 1])) {
      const headers = splitTableCells(line).map((cell) => parseInline(cell));
      const rows: InlineNode[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableCells(lines[i]).map((cell) => parseInline(cell)));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoteLines: InlineNode[][] = [];
      while (i < lines.length) {
        const match = lines[i].match(QUOTE_RE);
        if (!match) break;
        if (match[1].trim()) quoteLines.push(parseInline(match[1].trim()));
        i += 1;
      }
      if (quoteLines.length) blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    if (UL_RE.test(line)) {
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const match = lines[i].match(UL_RE);
        if (!match) break;
        items.push(parseInline(match[1].trim()));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (OL_RE.test(line)) {
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const match = lines[i].match(OL_RE);
        if (!match) break;
        items.push(parseInline(match[1].trim()));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paragraphLines: string[] = [line];
    i += 1;
    while (i < lines.length && !isBlockStart(lines[i], lines[i + 1])) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraphLines.join('\n')) });
  }

  return blocks;
}
