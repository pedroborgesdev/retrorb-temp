// @ts-nocheck -- Kept as syntax-valid JS so Vitest can exercise the CJS Electron module directly.
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

export function sanitizeLocalFilename(value) {
  if (typeof value !== 'string') return 'download.zip';
  let basename = value.replaceAll('\\', '/').split('/').at(-1) ?? '';
  basename = [...basename].filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('');
  basename = basename.replace(/[<>:"/\\|?*]/g, '_').replace(/^[ .]+|[ .]+$/g, '');
  if (!basename || basename === '.' || basename === '..') return 'download.zip';
  if (basename.length <= 180) return basename;
  const extension = path.extname(basename).slice(0, 21);
  return `${path.basename(basename, path.extname(basename)).slice(0, 150)}${extension}`;
}

async function exists(value) {
  try { await stat(value); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export class DownloadManager {
  tasks = new Map();
  active = new Map();
  running = new Map();
  listeners = new Set();

  constructor(options) { this.options = options; }

  list() { return [...this.tasks.values()].map((task) => ({ ...task })); }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(task) {
    const snapshot = { ...task };
    for (const listener of this.listeners) listener(snapshot);
  }

  async reserve(filename, id) {
    await mkdir(this.options.root, { recursive: true });
    const extension = path.extname(filename);
    const stem = path.basename(filename, extension);
    for (let suffix = 0; suffix < 10_000; suffix += 1) {
      const candidate = suffix === 0 ? filename : `${stem} (${suffix})${extension}`;
      const finalPath = path.join(this.options.root, candidate);
      const lockPath = path.join(this.options.root, `.${candidate}.retromancy.lock`);
      let lock;
      try {
        lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
        await lock.close();
        if (await exists(finalPath)) { await unlink(lockPath); continue; }
        return { finalPath, lockPath, partialPath: path.join(this.options.root, `.${candidate}.${id}.part`) };
      } catch (error) {
        await lock?.close().catch(() => undefined);
        if (error.code === 'EEXIST') continue;
        throw error;
      }
    }
    throw new Error('Não foi possível reservar um nome para o arquivo.');
  }

  async start(request) {
    const id = randomUUID();
    const filename = sanitizeLocalFilename(request.filename);
    const reserved = await this.reserve(filename, id);
    const task = {
      ...request, filename, id, status: 'queued', receivedBytes: 0, totalBytes: null,
      startedAt: new Date().toISOString(), completedAt: null, destination: null,
      error: null, platform: 'desktop',
    };
    this.tasks.set(id, task);
    this.active.set(id, { controller: new AbortController(), ...reserved });
    this.emit(task);
    const running = this.run(task, this.active.get(id));
    this.running.set(id, running);
    void running.finally(() => this.running.delete(id));
    return { ...task };
  }

  async cancel(id) {
    const task = this.tasks.get(id);
    if (!task) throw new Error('Download não encontrado.');
    const running = this.running.get(id);
    this.active.get(id)?.controller.abort();
    if (running) await running;
    return { ...(this.tasks.get(id) ?? task) };
  }

  async abortAll() {
    for (const current of this.active.values()) current.controller.abort();
    await Promise.allSettled([...this.running.values()]);
  }

  async run(task, active) {
    let file;
    try {
      file = await open(active.partialPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      task.status = 'downloading';
      this.emit(task);
      if (active.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const response = await this.options.fetcher(this.options.endpoint(task), { signal: active.controller.signal });
      if (!response.ok || !response.body) {
        let message = `O servidor local recusou o download (HTTP ${response.status}).`;
        try {
          const body = await response.json();
          if (typeof body.error === 'string') message = body.error;
        } catch { /* The response may not be JSON. */ }
        throw new Error(message);
      }
      const length = response.headers.get('Content-Length');
      task.totalBytes = length && /^\d+$/.test(length) ? Number(length) : null;
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (active.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await file.write(value);
        task.receivedBytes += value.byteLength;
        this.emit(task);
      }
      if (task.totalBytes !== null && task.receivedBytes !== task.totalBytes) {
        throw new Error('O download terminou incompleto e foi descartado.');
      }
      await file.close();
      file = undefined;
      await rename(active.partialPath, active.finalPath);
      await unlink(active.lockPath);
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.destination = active.finalPath;
      this.emit(task);
    } catch (error) {
      await file?.close().catch(() => undefined);
      await unlink(active.partialPath).catch(() => undefined);
      await unlink(active.lockPath).catch(() => undefined);
      const cancelled = active.controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      task.status = cancelled ? 'cancelled' : 'failed';
      task.completedAt = new Date().toISOString();
      task.error = cancelled ? null : error instanceof Error ? error.message : 'Falha inesperada no download.';
      this.emit(task);
    } finally {
      this.active.delete(task.id);
    }
  }
}
