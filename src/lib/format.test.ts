import { describe, expect, it } from 'vitest';
import { filterAndSort, formatNumber, safeUrl, sizeBytes } from './format';
import { gameResponseSchema, searchResponseSchema, type CatalogItem } from '../types/contracts';

const item = (title: string, size: string | null, downloads: number | null): CatalogItem => ({ title, size, downloads, console: 'GBA', source: 'romsfun', url: null, icon: null });

describe('untrusted links', () => {
  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'http://example.com', 'https://user:pass@example.com', 'https://example.com\\@localhost', 'https://example.com/\nfile'])('rejects %s', (url) => expect(safeUrl(url)).toBeNull());
  it('keeps signed HTTPS download URLs', () => expect(safeUrl('https://files.example.com/a.zip?token=a%2Bb')).toBe('https://files.example.com/a.zip?token=a%2Bb'));
});
describe('sorting loaded records', () => {
  it('compares sizes numerically across units and places unknown sizes last', () => {
    const records = [item('Unknown', null, null), item('Small', '12 MB', 0), item('Large', '1.5 GB', 100)];
    expect(filterAndSort(records, '', 'size').map((r) => r.title)).toEqual(['Large', 'Small', 'Unknown']);
    expect(records[0].title).toBe('Unknown');
    expect(sizeBytes('5.13 M')).toBeCloseTo(5.13 * 1024 ** 2);
  });
  it('distinguishes zero downloads from unavailable counts', () => {
    expect(filterAndSort([item('Unknown', null, null), item('Zero', null, 0)], '', 'downloads')[0].title).toBe('Zero');
    expect(formatNumber(0)).toBe('0'); expect(formatNumber(null)).toBe('—'); expect(formatNumber(NaN)).toBe('—');
  });
});
describe('API contracts', () => {
  it('accepts a provider error inside HTTP 200', () => {
    expect(searchResponseSchema.safeParse({ query: 'Pokemon', sources: { wowroms: { label: 'WowRoms', results: [], error: 'Offline', pagination: { page: 1, has_next: false } } } }).success).toBe(true);
  });
  it('accepts all nullable detail fields and rejects invalid objects', () => {
    const game = Object.fromEntries(['name', 'description', 'release_date', 'reviews_count', 'stars_rate', 'publisher', 'regions', 'icon', 'screenshots', 'downloads'].map((key) => [key, null]));
    expect(gameResponseSchema.safeParse({ source: 'romsfun', label: 'RomsFun', game }).success).toBe(true);
    expect(gameResponseSchema.safeParse({ source: 'romsfun', label: 'RomsFun', game: { ...game, screenshots: {} } }).success).toBe(false);
  });
});
