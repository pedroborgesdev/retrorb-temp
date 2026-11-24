import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DownloadManager, sanitizeLocalFilename } from './download-manager.cts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function request(filename = 'Pokemon Red.zip') {
  return {
    source: 'romsfun', gameUrl: 'https://romsfun.com/roms/pokemon.html', fileIndex: 0,
    title: 'Pokemon Red', icon: null, filename, size: '6 B',
  } as const;
}

async function root() {
  const value = await mkdtemp(path.join(tmpdir(), 'retromancy-download-'));
  roots.push(value);
  return value;
}

function waitFor(manager: DownloadManager, status: string) {
  return new Promise<ReturnType<DownloadManager['list']>[number]>((resolve) => {
    const stop = manager.subscribe((task) => {
      if (task.status === status) { stop(); resolve(task); }
    });
  });
}

describe('desktop download manager', () => {
  it('sanitizes local filenames', () => {
    expect(sanitizeLocalFilename('../../Pokemon\u0000 Red.zip')).toBe('Pokemon Red.zip');
    expect(sanitizeLocalFilename('..')).toBe('download.zip');
  });

  it('streams to a partial file, reports progress and completes atomically', async () => {
    const destination = await root();
    const manager = new DownloadManager({
      root: destination,
      endpoint: () => 'http://127.0.0.1:5000/api/download',
      fetcher: async () => new Response(new Uint8Array([1, 2, 3, 4, 5, 6]), { headers: { 'Content-Length': '6' } }),
    });
    const completed = waitFor(manager, 'completed');

    const started = await manager.start(request());
    const final = await completed;

    expect(started.status).toBe('queued');
    expect(final.receivedBytes).toBe(6);
    expect(final.totalBytes).toBe(6);
    expect(final.destination).toBe(path.join(destination, 'Pokemon Red.zip'));
    expect(await readdir(destination)).toEqual(['Pokemon Red.zip']);
  });

  it('reserves distinct destinations for simultaneous equal filenames', async () => {
    const destination = await root();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const manager = new DownloadManager({
      root: destination,
      endpoint: () => 'http://127.0.0.1:5000/api/download',
      fetcher: async () => { await gate; return new Response(new Uint8Array([1]), { headers: { 'Content-Length': '1' } }); },
    });

    await Promise.all([manager.start(request('same.zip')), manager.start(request('same.zip'))]);
    release();
    while (manager.list().some((task) => !['completed', 'failed'].includes(task.status))) await new Promise((resolve) => setTimeout(resolve, 5));

    expect((await readdir(destination)).sort()).toEqual(['same (1).zip', 'same.zip']);
  });

  it('cancels and removes the partial file', async () => {
    const destination = await root();
    const manager = new DownloadManager({
      root: destination,
      endpoint: () => 'http://127.0.0.1:5000/api/download',
      fetcher: (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    });
    const cancelled = waitFor(manager, 'cancelled');
    const started = await manager.start(request());

    await manager.cancel(started.id);
    await cancelled;

    expect(await readdir(destination)).toEqual([]);
  });

  it('waits for active cleanup when the application shuts down', async () => {
    const destination = await root();
    const manager = new DownloadManager({
      root: destination,
      endpoint: () => 'http://127.0.0.1:5000/api/download',
      fetcher: (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    });
    await manager.start(request());

    await manager.abortAll();

    expect(manager.list()[0].status).toBe('cancelled');
    expect(await readdir(destination)).toEqual([]);
  });

  it('does not complete a truncated response', async () => {
    const destination = await root();
    await writeFile(path.join(destination, 'existing.zip'), 'keep');
    const manager = new DownloadManager({
      root: destination,
      endpoint: () => 'http://127.0.0.1:5000/api/download',
      fetcher: async () => new Response(new Uint8Array([1, 2]), { headers: { 'Content-Length': '5' } }),
    });
    const failed = waitFor(manager, 'failed');

    await manager.start(request('broken.zip'));
    const final = await failed;

    expect(final.error).toContain('incompleto');
    expect(await readdir(destination)).toEqual(['existing.zip']);
  });
});
