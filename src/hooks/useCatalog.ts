import { useCallback, useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '../api/catalog';
import {
  EXPLORE_MAX_ITEMS,
  isInitialBatchReady,
  shouldAutoFetchMore,
} from '../lib/pagination';
import { useLibrary } from '../store/useLibrary';
import type { CatalogItem, Source } from '../types/contracts';

export function useConsoles() {
  return useQuery({ queryKey: ['consoles'], queryFn: ({ signal }) => catalogApi.consoles(signal), staleTime: 5 * 60_000, retry: false });
}

function useSourceSearch(query: string, source: Source, enabled: boolean, consoleName: string) {
  const client = useQueryClient();
  const scopeKey = `${source}|${query}|${consoleName}|${enabled}`;
  const [pageState, setPageState] = useState({ scopeKey, page: 1 });
  const page = pageState.scopeKey === scopeKey ? pageState.page : 1;
  const setPage = useCallback((nextPage: number) => {
    setPageState({ scopeKey, page: nextPage });
  }, [scopeKey]);
  const result = useInfiniteQuery({
    queryKey: ['search', source, query, consoleName],
    queryFn: ({ pageParam, signal }) => catalogApi.searchSource(query, source, pageParam, signal, consoleName),
    initialPageParam: 1,
    getNextPageParam: (last) => last.pagination.has_next ? last.pagination.page + 1 : undefined,
    enabled: enabled && Boolean(query || consoleName), staleTime: 5 * 60_000, gcTime: 30 * 60_000,
    retry: false, refetchOnWindowFocus: false,
  });
  const recordError = useLibrary((s) => s.recordError);
  const clearError = useLibrary((s) => s.clearError);
  useEffect(() => {
    if (!enabled) void client.cancelQueries({ queryKey: ['search', source, query, consoleName], exact: true });
  }, [enabled, client, source, query, consoleName]);
  useEffect(() => {
    if (result.error) recordError(source, result.error.message);
    else if (result.isSuccess) clearError(source);
  }, [result.error, result.isSuccess, source, recordError, clearError]);

  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  let lastPageAddedCount = 0;
  for (const pageData of result.data?.pages ?? []) {
    let added = 0;
    for (const item of pageData.results) {
      if (item.url && seen.has(item.url)) continue;
      if (item.url) seen.add(item.url);
      items.push({ ...item, source });
      added += 1;
    }
    lastPageAddedCount = added;
  }
  const pagesFetched = result.data?.pages.length ?? 0;
  const isReady = isInitialBatchReady({
    isPending: result.isPending,
    isFetching: result.isFetching,
    hasError: Boolean(result.error),
    hasNextPage: Boolean(result.hasNextPage),
    loadedUniqueCount: items.length,
    pagesFetched,
    lastPageAddedCount,
    maxItems: EXPLORE_MAX_ITEMS,
  });
  const shouldPrefetch = shouldAutoFetchMore({
    enabled: enabled && Boolean(query || consoleName),
    isFetching: result.isFetching,
    hasError: Boolean(result.error),
    hasNextPage: Boolean(result.hasNextPage),
    loadedUniqueCount: items.length,
    pagesFetched,
    lastPageAddedCount,
    maxItems: EXPLORE_MAX_ITEMS,
  });
  useEffect(() => {
    if (shouldPrefetch) void result.fetchNextPage();
  }, [shouldPrefetch, result.fetchNextPage]);

  return { ...result, items, source, page, setPage, isReady };
}

export function useCatalog(query: string, selected: readonly Source[], consoleName = '', consoleSources?: Source[]) {
  const enabled = useLibrary((s) => s.preferences.enabledSources);
  const active = (source: Source) => enabled.includes(source) && selected.includes(source) && (!consoleName || Boolean(consoleSources?.includes(source)));
  return [
    useSourceSearch(query, 'romsfun', active('romsfun'), consoleName),
    useSourceSearch(query, 'romspure', active('romspure'), consoleName),
    useSourceSearch(query, 'romsgames', active('romsgames'), consoleName),
    useSourceSearch(query, 'wowroms', active('wowroms'), consoleName),
  ].filter((result) => active(result.source));
}
export type SourceQuery = ReturnType<typeof useSourceSearch>;
