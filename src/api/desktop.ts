import { safeUrl } from '../lib/format';
import type { DownloadRequest, DownloadTask } from '../types/contracts';

export type WindowAction = 'minimize' | 'maximize' | 'close';
declare global {
  interface Window {
    desktop?: {
      windowAction: (action: WindowAction) => void;
      openExternal: (url: string) => Promise<void>;
      downloadStart: (request: DownloadRequest) => Promise<DownloadTask>;
      downloadCancel: (id: string) => Promise<DownloadTask>;
      downloadList: () => Promise<DownloadTask[]>;
      onDownloadChanged: (callback: (task: DownloadTask) => void) => () => void;
    };
  }
}

export const desktopApi = {
  get available() { return typeof window !== 'undefined' && Boolean(window.desktop); },
  windowAction: (action: WindowAction) => window.desktop?.windowAction(action),
  startDownload(request: DownloadRequest) {
    if (!window.desktop) throw new Error('Downloads locais só estão disponíveis no aplicativo.');
    return window.desktop.downloadStart(request);
  },
  cancelDownload(id: string) {
    if (!window.desktop) throw new Error('Downloads locais só estão disponíveis no aplicativo.');
    return window.desktop.downloadCancel(id);
  },
  listDownloads() { return window.desktop?.downloadList() ?? Promise.resolve([]); },
  onDownloadChanged(callback: (task: DownloadTask) => void) {
    return window.desktop?.onDownloadChanged(callback) ?? (() => {});
  },
  async openExternal(url: string) {
    const safe = safeUrl(url);
    if (!safe) throw new Error('Este link não está disponível.');
    if (window.desktop) return window.desktop.openExternal(safe);
    const link = document.createElement('a');
    link.href = safe;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  },
};
