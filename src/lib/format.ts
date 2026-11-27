import type { CatalogItem } from '../types/contracts';

export function safeUrl(value: string | null | undefined): string | null {
  if (!value || /[\x00-\x20\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function safeDownloadUrl(value: string | null | undefined): string | null {
  if (!value || value.includes('#')) return null;
  return safeUrl(value);
}

export const formatNumber = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('pt-BR', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);

export function sizeBytes(value: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^([\d.,]+)\s*(B|K(?:I?B)?|M(?:I?B)?|G(?:I?B)?|T(?:I?B)?)$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  const power = ['B', 'K', 'M', 'G', 'T'].indexOf(match[2][0].toUpperCase());
  return Number.isFinite(amount) ? amount * 1024 ** power : null;
}

export type Sort = 'relevance' | 'name' | 'size' | 'downloads';
export function filterAndSort(items: CatalogItem[], consoleName: string, sort: Sort): CatalogItem[] {
  const filtered = items.filter((item) => !consoleName || item.console === consoleName);
  if (sort === 'name') filtered.sort((a, b) => (a.title ?? '\uffff').localeCompare(b.title ?? '\uffff', 'pt-BR'));
  if (sort === 'size' || sort === 'downloads') filtered.sort((a, b) => {
    const left = sort === 'size' ? sizeBytes(a.size) : a.downloads;
    const right = sort === 'size' ? sizeBytes(b.size) : b.downloads;
    return left == null ? right == null ? 0 : 1 : right == null ? -1 : right - left;
  });
  return filtered;
}

export const itemId = (item: Pick<CatalogItem, 'source' | 'url' | 'title'>) => `${item.source}:${item.url ?? item.title ?? 'unknown'}`;
export const gamePath = (item: Pick<CatalogItem, 'source' | 'url'>) => `/game?${new URLSearchParams({ source: item.source, url: item.url ?? '' })}`;
export const shortDate = (date: string) => new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
