import type { z } from 'zod';

export class ApiError extends Error {
  constructor(message: string, public readonly status = 0) { super(message); this.name = 'ApiError'; }
}

const protocol = typeof location === 'undefined' ? 'http:' : location.protocol;
const base = (import.meta.env.VITE_API_BASE_URL || (protocol === 'file:' ? `http://127.0.0.1:${import.meta.env.VITE_LOCAL_API_PORT || '5000'}/api` : '/api')).replace(/\/$/, '');

export function apiUrl(path: string, params: Record<string, string>): string {
  return `${base}${path}?${new URLSearchParams(params)}`;
}

/** The only HTTP boundary used by the renderer. Components never fetch. */
export async function request<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path, params), { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('Não foi possível conectar à API. Verifique se o servidor está em execução.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : `A consulta falhou (HTTP ${response.status}).`;
    throw new ApiError(message, response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError('A API retornou dados em um formato inesperado.', response.status);
  return parsed.data;
}
