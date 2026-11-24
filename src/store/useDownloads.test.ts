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
  it('hydrates and applies desktop progress events', async () => {
    let listener: ((value: DownloadTask) => void) | undefined;
    const adapter: DownloadsAdapter = {
      start: vi.fn(), cancel: vi.fn(), list: vi.fn(async () => [task()]),
      onChanged: vi.fn((next) => { listener = next; return () => { listener = undefined; }; }),
    };
    const store = createDownloadsStore(adapter);

    const dispose = await store.getState().initialize();
    listener?.(task('completed', 10));

    expect(store.getState().tasks[0]).toMatchObject({ status: 'completed', receivedBytes: 10 });
    dispose();
    expect(listener).toBeUndefined();
  });

  it('delegates cancellation and records the returned state', async () => {
    const cancelled = task('cancelled');
    const adapter: DownloadsAdapter = {
      start: vi.fn(), cancel: vi.fn(async () => cancelled), list: vi.fn(async () => []), onChanged: vi.fn(() => () => {}),
    };
    const store = createDownloadsStore(adapter);

    await store.getState().cancel('one');

    expect(adapter.cancel).toHaveBeenCalledWith('one');
    expect(store.getState().tasks[0].status).toBe('cancelled');
  });
});
