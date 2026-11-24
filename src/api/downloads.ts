import type { DownloadRequest, DownloadTask } from '../types/contracts';
import { apiUrl } from './client';
import { desktopApi } from './desktop';

export interface DownloadPlatform {
  available: boolean;
  startDownload(request: DownloadRequest): Promise<DownloadTask>;
  cancelDownload(id: string): Promise<DownloadTask>;
  listDownloads(): Promise<DownloadTask[]>;
  onDownloadChanged(callback: (task: DownloadTask) => void): () => void;
}

type DocumentLike = Pick<Document, 'createElement'> & { body: Pick<HTMLElement, 'append'> };
type UrlBuilder = (path: string, params: Record<string, string>) => string;

export function createDownloadsApi(
  platform: DownloadPlatform,
  documentLike: DocumentLike | undefined = typeof document === 'undefined' ? undefined : document,
  buildUrl: UrlBuilder = apiUrl,
) {
  return {
    capabilities: { progress: platform.available, pause: false, resume: false, cancel: platform.available, openDirectory: false } as const,
    async start(request: DownloadRequest) {
      if (platform.available) return { mode: 'desktop' as const, task: await platform.startDownload(request) };
      if (!documentLike) throw new Error('O download não está disponível neste ambiente.');
      const link = documentLike.createElement('a');
      link.href = buildUrl('/download', {
        source: request.source,
        url: request.gameUrl,
        file: String(request.fileIndex),
        filename: request.filename,
      });
      link.download = request.filename;
      documentLike.body.append(link);
      link.click();
      link.remove();
      return { mode: 'web' as const };
    },
    cancel: (id: string) => platform.cancelDownload(id),
    list: () => platform.listDownloads(),
    onChanged: (callback: (task: DownloadTask) => void) => platform.onDownloadChanged(callback),
  };
}

export const downloadsApi = createDownloadsApi(desktopApi);
