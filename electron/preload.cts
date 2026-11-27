import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  windowAction: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window:action', action),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  downloadStart: (request: unknown) => ipcRenderer.invoke('download:start', request),
  downloadCancel: (id: string) => ipcRenderer.invoke('download:cancel', id),
  downloadRetry: (id: string) => ipcRenderer.invoke('download:retry', id),
  downloadList: () => ipcRenderer.invoke('download:list'),
  onDownloadChanged: (callback: (task: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, task: unknown) => callback(task);
    ipcRenderer.on('download:changed', listener);
    return () => ipcRenderer.off('download:changed', listener);
  },
});
