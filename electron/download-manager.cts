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

async function fileSize(filePath) {
  try {
    const info = await stat(filePath);
    return info.size;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

function parseContentRange(header) {
  if (typeof header !== 'string') return null;
  const match = header.trim().match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: match[3] === '*' ? null : Number(match[3]),
  };
}

export class DownloadManager {
  tasks = new Map();
  reservations = new Map();
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
    this.reservations.set(id, reserved);
    const active = { controller: new AbortController(), ...reserved };
    this.active.set(id, active);
    this.emit(task);
    const running = this.run(task, active, 0);
    this.running.set(id, running);
    return { ...task };
  }

  async retry(id) {
    const task = this.tasks.get(id);
    const reserved = this.reservations.get(id);
    if (!task || !reserved || task.status !== 'failed' || this.active.has(id) || this.running.has(id)) {
      throw new Error('Não é possível retomar este download.');
    }
    const resumeOffset = await fileSize(reserved.partialPath);
    task.status = 'queued';
    task.error = null;
    task.completedAt = null;
    task.receivedBytes = resumeOffset;
    const active = { controller: new AbortController(), ...reserved };
    this.active.set(id, active);
    this.emit(task);
    const running = this.run(task, active, resumeOffset);
    this.running.set(id, running);
    return { ...task };
  }

  async cancel(id) {
    const task = this.tasks.get(id);
    if (!task) throw new Error('Download não encontrado.');
    const running = this.running.get(id);
    if (running) {
      this.active.get(id)?.controller.abort();
      await running;
      if (!this.tasks.has(id)) {
        return { ...task, status: 'cancelled', error: null };
      }
    }
    const reserved = this.reservations.get(id);
    if (reserved) {
      await unlink(reserved.partialPath).catch(() => undefined);
      await unlink(reserved.lockPath).catch(() => undefined);
      this.reservations.delete(id);
    }
    this.tasks.delete(id);
    const cancelled = {
      ...task,
      status: 'cancelled',
      completedAt: new Date().toISOString(),
      error: null,
    };
    this.emit(cancelled);
    return cancelled;
  }

  async abortAll() {
    for (const current of this.active.values()) current.controller.abort();
    await Promise.allSettled([...this.running.values()]);
    const leftovers = [...this.reservations.entries()];
    await Promise.allSettled(leftovers.map(async ([id, reserved]) => {
      await unlink(reserved.partialPath).catch(() => undefined);
      await unlink(reserved.lockPath).catch(() => undefined);
      this.reservations.delete(id);
      this.tasks.delete(id);
    }));
  }

  async run(task, active, resumeOffset = 0) {
    let file;
    try {
      // Yield one microtask so start()/retry() return the queued snapshot with running registered.
      await Promise.resolve();
      if (active.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      task.status = 'downloading';
      this.emit(task);
      const fetchInit = resumeOffset > 0
        ? { signal: active.controller.signal, headers: { Range: `bytes=${resumeOffset}-` } }
        : { signal: active.controller.signal };
      const response = await this.options.fetcher(this.options.endpoint(task), fetchInit);
      if (!response.ok || !response.body) {
        let message = `O servidor local recusou o download (HTTP ${response.status}).`;
        try {
          const body = await response.json();
          if (typeof body.error === 'string') message = body.error;
        } catch { /* The response may not be JSON. */ }
        throw new Error(message);
      }
      const length = response.headers.get('Content-Length');
      if (resumeOffset > 0 && response.status === 206) {
        const parsedRange = parseContentRange(response.headers.get('Content-Range'));
        if (parsedRange && parsedRange.start !== resumeOffset) {
          throw new Error('O servidor retornou um trecho incompatível para retomada.');
        }
        if (parsedRange && parsedRange.total !== null) {
          task.totalBytes = parsedRange.total;
        } else if (length && /^\d+$/.test(length)) {
          task.totalBytes = resumeOffset + Number(length);
        }
        file = await open(active.partialPath, constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND);
        task.receivedBytes = resumeOffset;
        this.emit(task);
      } else {
        file = await open(active.partialPath, constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY);
        task.receivedBytes = 0;
        task.totalBytes = length && /^\d+$/.test(length) ? Number(length) : null;
      }
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (active.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await file.write(value);
        task.receivedBytes += value.byteLength;
        this.emit(task);
      }
      if (task.totalBytes !== null && task.receivedBytes > task.totalBytes) {
        await file.close();
        file = undefined;
        await unlink(active.partialPath).catch(() => undefined);
        throw new Error('O download recebeu dados inconsistentes.');
      }
      if (task.totalBytes !== null && task.receivedBytes < task.totalBytes) {
        throw new Error('O download terminou incompleto. Tente novamente para retomar.');
      }
      await file.close();
      file = undefined;
      if (active.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await rename(active.partialPath, active.finalPath);
      await unlink(active.lockPath);
      this.reservations.delete(task.id);
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.destination = active.finalPath;
      this.active.delete(task.id);
      this.running.delete(task.id);
      this.emit(task);
    } catch (error) {
      await file?.close().catch(() => undefined);
      const cancelled = active.controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      if (cancelled) {
        await unlink(active.partialPath).catch(() => undefined);
        await unlink(active.lockPath).catch(() => undefined);
        this.reservations.delete(task.id);
        this.tasks.delete(task.id);
        task.status = 'cancelled';
        task.completedAt = new Date().toISOString();
        task.error = null;
        this.active.delete(task.id);
        this.running.delete(task.id);
        this.emit(task);
      } else {
        task.receivedBytes = await fileSize(active.partialPath);
        task.status = 'failed';
        task.completedAt = new Date().toISOString();
        task.error = error instanceof Error ? error.message : 'Falha inesperada no download.';
        this.active.delete(task.id);
        this.running.delete(task.id);
        this.emit(task);
      }
    }
  }
}
