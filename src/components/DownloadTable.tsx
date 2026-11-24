import { useId, useState } from 'react';
import { ArrowDownToLine, FileArchive, LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CatalogItem, Download } from '../types/contracts';
import { downloadsApi } from '../api/downloads';
import { useLibrary } from '../store/useLibrary';
import { useDownloads } from '../store/useDownloads';
import { safeUrl } from '../lib/format';
import { button } from './ui';

export function DownloadTable({ files, item, live }: { files: Download[] | null; item: CatalogItem; live: boolean }) {
  const [pending, setPending] = useState<number | null>(null);
  const listId = useId();
  const notify = useLibrary((s) => s.setNotice);
  const record = useDownloads((s) => s.record);
  const navigate = useNavigate();
  async function start(file: Download, i: number) {
    setPending(i);
    try {
      if (!item.url) throw new Error('A página deste jogo não está disponível.');
      const result = await downloadsApi.start({
        source: item.source, gameUrl: item.url, fileIndex: i,
        title: item.title ?? 'Jogo sem título', icon: item.icon,
        filename: file.filename || 'download.zip', size: file.size,
      });
      if (result.mode === 'desktop') { record(result.task); navigate('/downloads'); }
      else notify('Download iniciado no navegador.');
    }
    catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível iniciar o download.'); }
    finally { setPending(null); }
  }
  return <section id="game-files" className="scroll-mt-6 space-y-4"><div className="flex items-center justify-between border-b border-line pb-3"><h2 className="flex items-center gap-3 text-base font-semibold"><FileArchive size={18} className="text-accent" />Arquivos disponíveis</h2><span className="text-xs text-muted">{files?.length || 0} arquivos</span></div>
    {!files?.length ? <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-5 py-10 text-center"><FileArchive size={22} className="mb-3 text-muted" /><h3 className="text-sm font-medium">Nenhum arquivo disponível</h3><p className="mt-2 text-xs text-muted">Esta fonte não retornou links de download para este jogo.</p></div> : <div role="table" aria-label="Arquivos disponíveis para download" className="overflow-hidden rounded-xl border border-line bg-surface"><div role="row" className="hidden grid-cols-[minmax(0,1fr)_80px_96px_140px] border-b border-line bg-canvas text-[11px] font-semibold text-muted min-[900px]:grid"><span role="columnheader" className="px-5 py-3">Arquivo</span><span role="columnheader" className="px-4 py-3">Formato</span><span role="columnheader" className="px-4 py-3">Tamanho</span><span role="columnheader" className="px-4 py-3 text-right">Download</span></div><div role="rowgroup" className="divide-y divide-line">{files.map((file, i) => <div role="row" key={`${file.filename}:${i}`} className="grid gap-3 p-4 transition-colors hover:bg-hover min-[900px]:grid-cols-[minmax(0,1fr)_80px_96px_140px] min-[900px]:items-center min-[900px]:px-5"><div role="cell" className="flex min-w-0 items-start gap-3"><FileArchive size={17} className="mt-0.5 shrink-0 text-muted" /><div className="min-w-0"><span id={`${listId}-${i}`} className="break-all text-sm font-medium">{file.filename || 'Nome indisponível'}</span><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted min-[900px]:hidden"><span>Formato: {file.type || '—'}</span><span>Tamanho: {file.size || '—'}</span></div></div></div><span role="cell" className="hidden break-words px-4 text-xs text-muted min-[900px]:block">{file.type || '—'}</span><span role="cell" className="hidden whitespace-nowrap px-4 text-xs text-muted min-[900px]:block">{file.size || '—'}</span><div role="cell" className="flex justify-end min-[900px]:px-4"><button aria-describedby={`${listId}-${i}`} disabled={!live || !safeUrl(file.download_url) || pending !== null} onClick={() => void start(file, i)} className={`${button} min-h-9 whitespace-nowrap rounded-lg`} title={!live ? 'Recarregue os detalhes para atualizar o link.' : !file.download_url ? 'Link indisponível' : 'Abrir download no navegador'}>{pending === i ? <LoaderCircle className="animate-spin" size={13} /> : <ArrowDownToLine size={13} />}{safeUrl(file.download_url) ? 'Baixar' : 'Indisponível'}</button></div></div>)}</div></div>}
    <p className="text-xs leading-5 text-muted">No aplicativo, o arquivo é salvo em <strong className="font-medium text-ink">roms/</strong> e pode ser acompanhado em Downloads. Na web, o navegador inicia o download sem sair desta página. {!live && 'Conecte-se à fonte para atualizar os links salvos.'}</p>
  </section>;
}
