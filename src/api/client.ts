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

/** Streams Server-Sent Events (with automatic JSON fallback) through the single renderer HTTP boundary. */
export async function requestStream<T, E extends string = string>(
  path: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
  onEvent?: (event: E, payload: T) => void,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path, params), {
      signal,
      headers: { Accept: 'text/event-stream, application/json' },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('Não foi possível conectar à API. Verifique se o servidor está em execução.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `A consulta falhou (HTTP ${response.status}).`;
    throw new ApiError(message, response.status);
  }

  if (!contentType.includes('text/event-stream') || !response.body) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError('A API retornou dados em um formato inesperado.', response.status);
    onEvent?.('done' as E, parsed.data);
    return parsed.data;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let latest: T | null = null;

  const processFrame = (rawFrame: string) => {
    const frame = rawFrame.trim();
    if (!frame) return;
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (!dataLines.length) return;
    const rawData = dataLines.join('\n');
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawData);
    } catch {
      return;
    }

    if (eventName === 'error') {
      const message =
        parsedJson && typeof parsedJson === 'object' && 'error' in parsedJson && typeof parsedJson.error === 'string'
          ? parsedJson.error
          : 'Não foi possível carregar este jogo. Tente novamente.';
      throw new ApiError(message, response.status);
    }

    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) return;
    latest = parsed.data;
    onEvent?.(eventName as E, parsed.data);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        processFrame(frame);
        boundary = buffer.indexOf('\n\n');
      }
    }
    buffer += decoder.decode().replace(/\r\n/g, '\n');
    if (buffer.trim()) {
      processFrame(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (latest === null) {
    throw new ApiError('A API retornou dados em um formato inesperado.', response.status);
  }
  return latest;
}

export async function postJson<T>(
  path: string,
  payload: unknown,
  schema: z.ZodType<T>,
  options: { signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      signal: options.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('Não foi possível conectar à API. Verifique se o servidor está em execução.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `A consulta falhou (HTTP ${response.status}).`;
    throw new ApiError(message, response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError('A API retornou dados em um formato inesperado.', response.status);
  return parsed.data;
}
