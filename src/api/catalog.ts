import { consoleCatalogSchema, gameResponseSchema, romRefSchema, searchResponseSchema, type GameResponse, type Source } from '../types/contracts';
import { request, requestStream, ApiError } from './client';

export type GameStreamStage = 'details' | 'downloads' | 'done';

const ROM_CODE_PATTERN = /^RO1-[A-Za-z0-9_-]{8,160}$/;

export function isRomCode(value: string): boolean {
  return ROM_CODE_PATTERN.test(value.trim());
}

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
  gameStream: (
    source: Source,
    url: string,
    onProgress?: (stage: GameStreamStage, data: GameResponse) => void,
    signal?: AbortSignal,
  ) => requestStream<GameResponse, GameStreamStage>('/game', { source, url }, gameResponseSchema, onProgress, signal),
  resolveRomCode: (code: string, signal?: AbortSignal) =>
    request(`/roms/${encodeURIComponent(code.trim())}`, {}, romRefSchema, signal),
};
