import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DownloadManager } from './download-manager.cjs';

const development = process.argv.includes('--dev');
const entry = development ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
let window: BrowserWindow | null = null;
let downloads: DownloadManager | null = null;
let finishingDownloads = false;
const icons = path.join(__dirname, development ? '../public/icons' : '../dist/icons');

function trusted(url: string) { return url.split('#')[0] === entry; }
function trustedSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  return Boolean(window && event.sender === window.webContents && trusted(event.senderFrame?.url ?? ''));
}
function validDownloadRequest(value: unknown): value is {
  source: 'romsfun' | 'romspure' | 'romsgames' | 'wowroms'; gameUrl: string; fileIndex: number;
  title: string; icon: string | null; filename: string; size: string | null;
} {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return ['romsfun', 'romspure', 'romsgames', 'wowroms'].includes(String(item.source))
    && typeof item.gameUrl === 'string' && item.gameUrl.length <= 2048 && item.gameUrl.startsWith('https://')
    && Number.isInteger(item.fileIndex) && Number(item.fileIndex) >= 0 && Number(item.fileIndex) <= 1000
    && typeof item.title === 'string' && item.title.length <= 500
    && (item.icon === null || typeof item.icon === 'string')
    && typeof item.filename === 'string' && item.filename.length <= 500
    && (item.size === null || typeof item.size === 'string');
}
function downloadEndpoint(request: { source: string; gameUrl: string; fileIndex: number; filename: string }) {
  const port = process.env.API_PORT || '5000';
  const query = new URLSearchParams({
    source: request.source, url: request.gameUrl, file: String(request.fileIndex), filename: request.filename,
  });
  return `http://127.0.0.1:${port}/api/download?${query}`;
}
function createWindow() {
  window = new BrowserWindow({
    title: 'Retromancy', width: 1366, height: 850, minWidth: 860, minHeight: 600,
    frame: false, backgroundColor: '#111113', show: false,
    icon: path.join(icons, process.platform === 'win32' ? 'retrorb.ico' : 'retrorb-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!trusted(url)) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = null; });
  void window.loadURL(entry);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.setIcon(path.join(icons, 'retrorb-512.png'));
  downloads = new DownloadManager({
    root: path.join(app.getAppPath(), 'roms'),
    endpoint: downloadEndpoint,
    fetcher: (url: string, init: { signal: AbortSignal }) => net.fetch(url, init),
  });
  downloads.subscribe((task: unknown) => {
    if (window && !window.isDestroyed()) window.webContents.send('download:changed', task);
  });
  ipcMain.on('window:action', (event, action: unknown) => {
    if (!trustedSender(event) || !window) return;
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') { if (window.isMaximized()) window.unmaximize(); else window.maximize(); }
    if (action === 'close') window.close();
  });
  ipcMain.handle('external:open', async (event, value: unknown) => {
    if (!trustedSender(event) || typeof value !== 'string') throw new Error('Ação indisponível.');
    if (/[\x00-\x20\\]/.test(value)) throw new Error('URL inválida.');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('URL inválida.');
    await shell.openExternal(url.href);
  });
  ipcMain.handle('download:start', async (event, value: unknown) => {
    if (!trustedSender(event) || !downloads || !validDownloadRequest(value)) throw new Error('Pedido de download inválido.');
    return downloads.start(value);
  });
  ipcMain.handle('download:cancel', async (event, value: unknown) => {
    if (!trustedSender(event) || !downloads || typeof value !== 'string' || value.length > 100) throw new Error('Download inválido.');
    return downloads.cancel(value);
  });
  ipcMain.handle('download:list', async (event) => {
    if (!trustedSender(event) || !downloads) throw new Error('Ação indisponível.');
    return downloads.list();
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('before-quit', (event) => {
  if (!downloads || finishingDownloads) return;
  event.preventDefault();
  finishingDownloads = true;
  void downloads.abortAll().finally(() => app.quit());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
