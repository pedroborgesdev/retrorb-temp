import { consoleCatalogSchema, gameResponseSchema, searchResponseSchema, type Source } from '../types/contracts';
import { request, ApiError } from './client';

export const catalogApi = {
  consoles: (signal?: AbortSignal) => request('/consoles', {}, consoleCatalogSchema, signal),
  search: (query: string, source?: Source, page = 1, signal?: AbortSignal, consoleName = '') =>
    request('/search', { q: query, page: String(page), ...(source ? { source } : {}), ...(consoleName ? { console: consoleName } : {}) }, searchResponseSchema, signal),
  async searchSource(query: string, source: Source, page = 1, signal?: AbortSignal, consoleName = '') {
    const response = await this.search(query, source, page, signal, consoleName);
    const result = response.sources[source];
    if (!result) throw new ApiError('A fonte não foi incluída na resposta.');
    if (result.error) throw new ApiError(result.error);
    return result;
  },
  game: (source: Source, url: string, signal?: AbortSignal) =>
    request('/game', { source, url }, gameResponseSchema, signal),
};
