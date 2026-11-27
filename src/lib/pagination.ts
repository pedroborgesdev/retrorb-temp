export const EXPLORE_PAGE_SIZE = 15;
export const EXPLORE_MAX_PAGES = 4;
export const EXPLORE_MAX_ITEMS = EXPLORE_PAGE_SIZE * EXPLORE_MAX_PAGES;

export function shouldAutoFetchMore({
  enabled,
  isFetching,
  hasError,
  hasNextPage,
  loadedUniqueCount,
  pagesFetched,
  lastPageAddedCount,
  maxItems = EXPLORE_MAX_ITEMS,
}: {
  enabled: boolean;
  isFetching: boolean;
  hasError: boolean;
  hasNextPage: boolean;
  loadedUniqueCount: number;
  pagesFetched: number;
  lastPageAddedCount: number;
  maxItems?: number;
}): boolean {
  return (
    enabled &&
    !isFetching &&
    !hasError &&
    hasNextPage &&
    pagesFetched > 0 &&
    loadedUniqueCount < maxItems &&
    lastPageAddedCount > 0 &&
    pagesFetched < Math.ceil(maxItems / 5) + 4
  );
}

export function isInitialBatchReady({
  isPending,
  isFetching,
  hasError,
  hasNextPage,
  loadedUniqueCount,
  pagesFetched,
  lastPageAddedCount,
  maxItems = EXPLORE_MAX_ITEMS,
}: {
  isPending: boolean;
  isFetching: boolean;
  hasError: boolean;
  hasNextPage: boolean;
  loadedUniqueCount: number;
  pagesFetched: number;
  lastPageAddedCount: number;
  maxItems?: number;
}): boolean {
  if (isPending) return false;
  if (hasError) return true;
  if (loadedUniqueCount >= maxItems) return true;
  if (!hasNextPage) return true;
  if (pagesFetched > 0 && lastPageAddedCount === 0) return true;
  if (pagesFetched >= Math.ceil(maxItems / 5) + 4) return true;
  if (isFetching) return false;
  return false;
}

export function paginateExploreItems<T>(
  sortedItems: readonly T[],
  page: number,
  pageSize = EXPLORE_PAGE_SIZE,
  maxItems = EXPLORE_MAX_ITEMS,
): {
  page: number;
  totalPages: number;
  visibleGameCount: number;
  totalSlots: number;
  pageItems: T[];
  showRefineCard: boolean;
  capped: boolean;
  startIndex: number;
  endIndex: number;
} {
  const capped = sortedItems.length >= maxItems;
  const visibleItems = capped ? sortedItems.slice(0, maxItems - 1) : [...sortedItems];
  const totalSlots = capped ? maxItems : visibleItems.length;
  const totalPages = Math.max(1, Math.ceil(totalSlots / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(page)));
  const startIndex = (safePage - 1) * pageSize;
  const pageItems = visibleItems.slice(startIndex, startIndex + pageSize);
  const showRefineCard = capped && safePage === totalPages;
  return {
    page: safePage,
    totalPages,
    visibleGameCount: visibleItems.length,
    totalSlots,
    pageItems,
    showRefineCard,
    capped,
    startIndex,
    endIndex: startIndex + pageItems.length,
  };
}

export function buildPageTokens(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 1) return [1];
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const candidates = new Set<number>([1, totalPages]);
  for (let p = currentPage - 1; p <= currentPage + 1; p += 1) {
    if (p >= 1 && p <= totalPages) candidates.add(p);
  }
  if (currentPage <= 2) {
    candidates.add(2);
    candidates.add(3);
  }
  if (currentPage >= totalPages - 1) {
    candidates.add(totalPages - 2);
    candidates.add(totalPages - 1);
  }

  const sorted = [...candidates].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const tokens: Array<number | 'ellipsis'> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const value = sorted[i];
    if (i > 0 && value - sorted[i - 1] > 1) tokens.push('ellipsis');
    tokens.push(value);
  }
  return tokens;
}
