import { describe, expect, it, vi } from 'vitest';
import { createDownloadsStore, type DownloadsAdapter } from './useDownloads';
import type { DownloadTask } from '../types/contracts';

function task(status: DownloadTask['status'] = 'downloading', receivedBytes = 2): DownloadTask {
  return {
    id: 'one', source: 'romsfun', gameUrl: 'https://romsfun.com/game', fileIndex: 0,
    title: 'Pokemon Red', icon: null, filename: 'game.zip', size: '10 B', status,
    receivedBytes, totalBytes: 10, startedAt: '2026-11-23T10:00:00.000Z', completedAt: null,
    destination: null, error: null, platform: 'desktop',
  };
}

describe('download store', () => {
  it('hydrates, applies desktop progress events, and removes cancelled tasks', async () => {
    let listener: ((value: DownloadTask) => void) | undefined;
    const adapter: DownloadsAdapter = {
      start: vi.fn(), cancel: vi.fn(), retry: vi.fn(), list: vi.fn(async () => [task()]),
      onChanged: vi.fn((next) => { listener = next; return () => { listener = undefined; }; }),
    };
    const store = createDownloadsStore(adapter);

    const dispose = await store.getState().initialize();
    listener?.(task('completed', 10));
    expect(store.getState().tasks[0]).toMatchObject({ status: 'completed', receivedBytes: 10 });

    listener?.(task('cancelled', 2));
    expect(store.getState().tasks).toEqual([]);

    dispose();
    expect(listener).toBeUndefined();
  });

  it('delegates cancellation and removes the task from the list', async () => {
    const cancelled = task('cancelled');
    const adapter: DownloadsAdapter = {
      start: vi.fn(),
      cancel: vi.fn(async () => cancelled),
      retry: vi.fn(),
      list: vi.fn(async () => [task('downloading', 4)]),
      onChanged: vi.fn(() => () => {}),
    };
    const store = createDownloadsStore(adapter);
    await store.getState().initialize();

    await store.getState().cancel('one');

    expect(adapter.cancel).toHaveBeenCalledWith('one');
    expect(store.getState().tasks).toEqual([]);
  });

  it('delegates retry and keeps partial receivedBytes', async () => {
    const resumed = task('downloading', 5);
    const adapter: DownloadsAdapter = {
      start: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(async () => resumed),
      list: vi.fn(async () => [{ ...task('failed', 5), error: 'Falha de rede' }]),
      onChanged: vi.fn(() => () => {}),
    };
    const store = createDownloadsStore(adapter);
    await store.getState().initialize();

    await store.getState().retry('one');

    expect(adapter.retry).toHaveBeenCalledWith('one');
    expect(store.getState().tasks[0]).toMatchObject({ status: 'downloading', receivedBytes: 5, error: null });
  });
});
