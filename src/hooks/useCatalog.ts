import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '../api/catalog';
import { useLibrary } from '../store/useLibrary';
import type { CatalogItem, Source } from '../types/contracts';

export function useConsoles() {
  return useQuery({ queryKey: ['consoles'], queryFn: ({ signal }) => catalogApi.consoles(signal), staleTime: 5 * 60_000, retry: false });
}

function useSourceSearch(query: string, source: Source, enabled: boolean, consoleName: string) {
  const client = useQueryClient();
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
  const items: CatalogItem[] = (result.data?.pages.flatMap((p) => p.results) ?? []).filter((item) => {
    if (!item.url) return true;
    if (seen.has(item.url)) return false;
    seen.add(item.url); return true;
  }).map((item) => ({ ...item, source }));
  return { ...result, items, source };
}

export function useCatalog(query: string, selected: Source | 'all', consoleName = '', consoleSources?: Source[]) {
  const enabled = useLibrary((s) => s.preferences.enabledSources);
  const active = (source: Source) => enabled.includes(source) && (selected === 'all' || selected === source) && (!consoleName || Boolean(consoleSources?.includes(source)));
  return [
    useSourceSearch(query, 'romsfun', active('romsfun'), consoleName),
    useSourceSearch(query, 'romspure', active('romspure'), consoleName),
    useSourceSearch(query, 'romsgames', active('romsgames'), consoleName),
    useSourceSearch(query, 'wowroms', active('wowroms'), consoleName),
  ].filter((result) => active(result.source));
}
export type SourceQuery = ReturnType<typeof useSourceSearch>;
