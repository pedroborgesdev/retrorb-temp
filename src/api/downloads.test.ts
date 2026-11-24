import { describe, expect, it, vi } from 'vitest';
import { createDownloadsApi, type DownloadPlatform } from './downloads';
import type { DownloadRequest, DownloadTask } from '../types/contracts';

const request: DownloadRequest = {
  source: 'romsfun',
  gameUrl: 'https://romsfun.com/roms/pokemon.html',
  fileIndex: 0,
  title: 'Pokemon Red',
  icon: null,
  filename: 'Pokemon Red.zip',
  size: '5 MB',
};

function task(): DownloadTask {
  return {
    id: 'task-1', ...request, status: 'queued', receivedBytes: 0, totalBytes: null,
    startedAt: '2026-11-23T12:00:00.000Z', completedAt: null, destination: null,
    error: null, platform: 'desktop',
  };
}

describe('downloads API', () => {
  it('starts a browser attachment without a target or route change', async () => {
    const clicked = vi.fn();
    const removed = vi.fn();
    const link: Record<string, unknown> = { click: clicked, remove: removed };
    const documentLike = {
      createElement: vi.fn(() => link),
      body: { append: vi.fn() },
    };
    const platform: DownloadPlatform = {
      available: false,
      startDownload: vi.fn(), cancelDownload: vi.fn(), listDownloads: vi.fn(), onDownloadChanged: vi.fn(),
    };
    const api = createDownloadsApi(platform, documentLike as never, (path, params) => `${path}?${new URLSearchParams(params)}`);

    const result = await api.start(request);

    expect(result).toEqual({ mode: 'web' });
    expect(link.href).toContain('/download?');
    expect(link.href).toContain('filename=Pokemon+Red.zip');
    expect(link.download).toBe('Pokemon Red.zip');
    expect(link.target).toBeUndefined();
    expect(clicked).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
  });

  it('delegates desktop downloads to the narrow platform API', async () => {
    const started = task();
    const platform: DownloadPlatform = {
      available: true,
      startDownload: vi.fn(async () => started), cancelDownload: vi.fn(), listDownloads: vi.fn(), onDownloadChanged: vi.fn(),
    };
    const api = createDownloadsApi(platform, undefined, vi.fn());

    const result = await api.start(request);

    expect(platform.startDownload).toHaveBeenCalledWith(request);
    expect(result).toEqual({ mode: 'desktop', task: started });
  });
});
