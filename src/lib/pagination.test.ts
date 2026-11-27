import { describe, expect, it } from 'vitest';
import { filterAndSort } from './format';
import type { CatalogItem } from '../types/contracts';
import {
  buildPageTokens,
  EXPLORE_MAX_ITEMS,
  EXPLORE_MAX_PAGES,
  EXPLORE_PAGE_SIZE,
  isInitialBatchReady,
  paginateExploreItems,
  shouldAutoFetchMore,
} from './pagination';

describe('pagination helpers', () => {
  it('targets 60 items across 4 pages of 15', () => {
    expect(EXPLORE_PAGE_SIZE).toBe(15);
    expect(EXPLORE_MAX_PAGES).toBe(4);
    expect(EXPLORE_MAX_ITEMS).toBe(60);
  });

  it('fetches upstream pages until 60 unique items or end of provider results', () => {
    const base = {
      enabled: true,
      isFetching: false,
      hasError: false,
      hasNextPage: true,
      loadedUniqueCount: 47,
      pagesFetched: 2,
      lastPageAddedCount: 23,
    };
    expect(shouldAutoFetchMore(base)).toBe(true);
    expect(shouldAutoFetchMore({ ...base, loadedUniqueCount: 60, pagesFetched: 3 })).toBe(false);
    expect(shouldAutoFetchMore({ ...base, loadedUniqueCount: 72, pagesFetched: 3 })).toBe(false);
    expect(shouldAutoFetchMore({ ...base, lastPageAddedCount: 0, pagesFetched: 2 })).toBe(false);
    expect(shouldAutoFetchMore({ ...base, hasError: true })).toBe(false);
    expect(shouldAutoFetchMore({ ...base, isFetching: true })).toBe(false);
    expect(shouldAutoFetchMore({ ...base, hasNextPage: false })).toBe(false);
    expect(shouldAutoFetchMore({ ...base, enabled: false })).toBe(false);
    expect(shouldAutoFetchMore({ ...base, pagesFetched: 0 })).toBe(false);
    expect(shouldAutoFetchMore({ ...base, pagesFetched: 16 })).toBe(false);
  });

  it('caps at 59 real games + custom refine card on slot 60 when 60+ items are fetched', () => {
    const items = Array.from({ length: 72 }, (_, i) => i + 1);
    const p1 = paginateExploreItems(items, 1);
    expect(p1).toMatchObject({
      page: 1,
      totalPages: 4,
      visibleGameCount: 59,
      totalSlots: 60,
      showRefineCard: false,
      capped: true,
      startIndex: 0,
      endIndex: 15,
    });
    expect(p1.pageItems).toHaveLength(15);

    const p4 = paginateExploreItems(items, 4);
    expect(p4).toMatchObject({
      page: 4,
      totalPages: 4,
      visibleGameCount: 59,
      totalSlots: 60,
      showRefineCard: true,
      capped: true,
      startIndex: 45,
      endIndex: 59,
    });
    expect(p4.pageItems).toHaveLength(14);
  });

  it('shows all results without the refine card when provider has fewer than 60 games', () => {
    const items = Array.from({ length: 34 }, (_, i) => i + 1);
    const p3 = paginateExploreItems(items, 3);
    expect(p3).toEqual({
      page: 3,
      totalPages: 3,
      visibleGameCount: 34,
      totalSlots: 34,
      pageItems: items.slice(30, 34),
      showRefineCard: false,
      capped: false,
      startIndex: 30,
      endIndex: 34,
    });
  });

  it('places a 160k-download game from the 60th collected item directly on page 1', () => {
    const batch60: CatalogItem[] = Array.from({ length: 60 }, (_, idx) => ({
      source: 'romsfun',
      title: idx === 59 ? 'Pokemon Fire Red' : `Game ${idx + 1}`,
      url: `https://romsfun.com/roms/game-${idx + 1}.html`,
      icon: null,
      console: 'Game Boy Advance',
      size: '16 MB',
      downloads: idx === 59 ? 160000 : 1000 - idx,
    }));
    const sorted = filterAndSort(batch60, '', 'downloads');
    const page1 = paginateExploreItems(sorted, 1);
    expect(page1.totalPages).toBe(4);
    expect(page1.visibleGameCount).toBe(59);
    expect(page1.pageItems[0].title).toBe('Pokemon Fire Red');
  });

  it('builds compact page tokens with ellipsis when pages exceed 5', () => {
    expect(buildPageTokens(1, 4)).toEqual([1, 2, 3, 4]);
    expect(buildPageTokens(1, 8)).toEqual([1, 2, 3, 'ellipsis', 8]);
    expect(buildPageTokens(5, 8)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 8]);
    expect(buildPageTokens(8, 8)).toEqual([1, 'ellipsis', 6, 7, 8]);
  });

  it('holds initial display until 60 items or all available pages finish loading', () => {
    const base = {
      isPending: false,
      isFetching: true,
      hasError: false,
      hasNextPage: true,
      loadedUniqueCount: 47,
      pagesFetched: 2,
      lastPageAddedCount: 23,
    };
    expect(isInitialBatchReady({ ...base, isPending: true, loadedUniqueCount: 0, pagesFetched: 0 })).toBe(false);
    expect(isInitialBatchReady(base)).toBe(false);
    expect(isInitialBatchReady({ ...base, isFetching: false })).toBe(false);
    expect(isInitialBatchReady({ ...base, loadedUniqueCount: 60, pagesFetched: 3 })).toBe(true);
    expect(isInitialBatchReady({ ...base, loadedUniqueCount: 12, hasNextPage: false, isFetching: false })).toBe(true);
    expect(isInitialBatchReady({ ...base, hasError: true, isFetching: false })).toBe(true);
    expect(isInitialBatchReady({ ...base, lastPageAddedCount: 0, pagesFetched: 2, isFetching: false })).toBe(true);
    expect(isInitialBatchReady({ ...base, pagesFetched: 16 })).toBe(true);
  });
});
