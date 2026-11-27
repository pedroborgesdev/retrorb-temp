import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { ArrowDownToLine, Check, Copy, FileArchive, LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CatalogItem, Download } from '../types/contracts';
import { downloadsApi } from '../api/downloads';
import { useLibrary } from '../store/useLibrary';
import { useDownloads } from '../store/useDownloads';
import { safeDownloadUrl } from '../lib/format';
import { button } from './ui';

export function DownloadTable({
  files,
  item,
  live,
  highlightedFileIndex = null,
  loadingFiles = false,
  resolvingLinks = false,
}: {
  files: Download[] | null;
  item: CatalogItem;
  live: boolean;
  highlightedFileIndex?: number | null;
  loadingFiles?: boolean;
  resolvingLinks?: boolean;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listId = useId();
  const notify = useLibrary((s) => s.setNotice);
  const record = useDownloads((s) => s.record);
  const navigate = useNavigate();
  const count = files?.length || 0;

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  async function copyCode(code: string, index: number) {
    try {
      await navigator.clipboard.writeText(code);
      clearTimeout(copyTimer.current);
      setCopiedIndex(index);
      notify('Código da ROM copiado.');
      copyTimer.current = setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      notify(`Código da ROM: ${code}`);
    }
  }

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

  return (
    <section
      id="game-files"
      className="retro-rise scroll-mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
      style={{ '--stagger': 2 } as CSSProperties}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line bg-inset/40 px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent shadow-sm sm:size-9">
            <FileArchive size={16} />
          </span>
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink sm:text-base">Arquivos disponíveis</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loadingFiles ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[11px] font-medium text-muted sm:px-3 sm:py-1">
              <LoaderCircle size={11} className="animate-spin text-accent" aria-hidden="true" />
              Buscando arquivos…
            </span>
          ) : (
            <>
              {resolvingLinks && (
                <span className="retro-field-in inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                  <LoaderCircle size={11} className="animate-spin" aria-hidden="true" />
                  Verificando links…
                </span>
              )}
              <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-muted sm:px-3 sm:py-1">
                {count} {count === 1 ? 'arquivo' : 'arquivos'}
              </span>
            </>
          )}
        </div>
      </div>

      {loadingFiles ? (
        <div role="status" aria-live="polite" aria-label="Buscando arquivos disponíveis" className="retro-skeleton-group divide-y divide-line/70">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="grid gap-2.5 px-4 py-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_96px_104px_144px] min-[900px]:items-center min-[900px]:gap-3 min-[900px]:px-5"
            >
              <div className="flex items-center gap-3">
                <div className="size-7 shrink-0 rounded-lg bg-hover" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className={`h-3 rounded-full bg-hover ${idx === 0 ? 'w-3/4' : idx === 1 ? 'w-2/3' : 'w-1/2'}`} />
                  <div className="h-2.5 w-28 rounded-full bg-hover min-[900px]:hidden" />
                </div>
              </div>
              <div className="hidden px-4 min-[900px]:block">
                <div className="h-5 w-12 rounded-md bg-hover" />
              </div>
              <div className="hidden px-4 min-[900px]:block">
                <div className="h-3.5 w-16 rounded-full bg-hover" />
              </div>
              <div className="flex justify-end min-[900px]:px-4">
                <div className="h-8 w-24 rounded-[10px] bg-hover sm:h-9" />
              </div>
            </div>
          ))}
        </div>
      ) : !files?.length ? (
        <div className="flex flex-col items-center px-5 py-8 text-center">
          <span aria-hidden="true" className="mb-3 flex size-10 items-center justify-center rounded-xl border border-line bg-inset text-muted">
            <FileArchive size={18} />
          </span>
          <h3 className="font-display text-sm font-medium text-ink">Nenhum arquivo disponível</h3>
          <p className="mt-1.5 text-xs text-muted">Esta fonte não retornou links de download para este jogo.</p>
        </div>
      ) : (
        <div role="table" aria-label="Arquivos disponíveis para download">
          <div role="row" className="hidden grid-cols-[minmax(0,1fr)_96px_104px_144px] border-b border-line/80 bg-inset/25 text-[11px] font-semibold text-muted min-[900px]:grid">
            <span role="columnheader" className="px-5 py-2.5">Arquivo</span>
            <span role="columnheader" className="px-4 py-2.5">Formato</span>
            <span role="columnheader" className="px-4 py-2.5">Tamanho</span>
            <span role="columnheader" className="px-4 py-2.5 text-right">Download</span>
          </div>
          <div role="rowgroup" className="divide-y divide-line/70">
            {files.map((file, i) => {
              const availableUrl = safeDownloadUrl(file.download_url);
              const isHighlighted = highlightedFileIndex === i;
              const isRowResolving = !availableUrl && resolvingLinks;
              return (
                <div
                  role="row"
                  key={`${file.filename ?? 'file'}:${i}`}
                  style={{ '--stagger': i } as CSSProperties}
                  className={`retro-rise grid gap-2.5 px-4 py-3 transition-colors duration-150 min-[900px]:grid-cols-[minmax(0,1fr)_96px_104px_auto] min-[900px]:items-center min-[900px]:gap-3 min-[900px]:px-5 min-[900px]:py-3.5 ${
                    isHighlighted ? 'bg-accent/10 ring-1 ring-inset ring-accent/40' : 'hover:bg-hover/60'
                  }`}
                >
                  <div role="cell" className="flex min-w-0 items-start gap-2.5 sm:gap-3">
                    <span aria-hidden="true" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-inset text-muted">
                      <FileArchive size={13} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span id={`${listId}-${i}`} className="break-all font-mono text-xs font-medium text-ink sm:text-[13px]">{file.filename || 'Nome indisponível'}</span>
                        {isHighlighted && (
                          <span className="rounded-md border border-accent/40 bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                            Selecionado
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[10px] text-muted min-[900px]:hidden">
                        <span className="rounded border border-line bg-inset px-1.5 py-0.5">Formato: {file.type || '—'}</span>
                        <span className="rounded border border-line bg-inset px-1.5 py-0.5">Tamanho: {file.size || '—'}</span>
                      </div>
                    </div>
                  </div>
                  <span role="cell" className="hidden px-4 min-[900px]:block">
                    {file.type ? <span className="inline-flex rounded-md border border-line bg-inset px-2 py-0.5 font-mono text-[11px] font-medium text-muted">{file.type}</span> : <span className="text-xs text-muted">—</span>}
                  </span>
                  <span role="cell" className="hidden whitespace-nowrap px-4 font-mono text-xs tabular-nums text-muted min-[900px]:block">{file.size || '—'}</span>
                  <div role="cell" className="flex items-center justify-end gap-1.5 min-[900px]:px-4">
                    {file.code && (
                      <button
                        type="button"
                        onClick={() => void copyCode(file.code!, i)}
                        title={`Copiar código da ROM (${file.code})`}
                        aria-label={`Copiar código da ROM ${file.filename || i + 1}`}
                        className={`${button} retro-field-in min-h-8 shrink-0 px-2.5 font-mono text-[11px] sm:min-h-9`}
                      >
                        {copiedIndex === i ? <Check size={13} className="text-accent" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                        <span className="hidden sm:inline">{copiedIndex === i ? 'Copiado' : 'Código'}</span>
                      </button>
                    )}
                    {isRowResolving ? (
                      <button
                        type="button"
                        aria-describedby={`${listId}-${i}`}
                        disabled
                        className={`${button} min-h-8 whitespace-nowrap rounded-[10px] sm:min-h-9`}
                        title="Resolvendo link de download…"
                      >
                        <LoaderCircle className="animate-spin text-accent" size={13} aria-hidden="true" />
                        Preparando…
                      </button>
                    ) : (
                      <button
                        aria-describedby={`${listId}-${i}`}
                        disabled={!live || !availableUrl || pending !== null}
                        onClick={() => void start(file, i)}
                        className={`${
                          availableUrl
                            ? 'retro-field-in inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent shadow-sm transition-all duration-150 hover:brightness-110 active:scale-[0.97] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9 sm:gap-2 sm:px-3.5 sm:py-2'
                            : `${button} min-h-8 whitespace-nowrap rounded-[10px] sm:min-h-9`
                        }`}
                        title={!live ? 'Recarregue os detalhes para atualizar o link.' : !availableUrl ? 'Link indisponível' : 'Baixar pela aplicação'}
                      >
                        {pending === i ? <LoaderCircle className="animate-spin" size={13} /> : <ArrowDownToLine size={13} />}
                        {availableUrl ? 'Baixar' : 'Indisponível'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="border-t border-line/70 bg-inset/25 px-4 py-2.5 text-[11px] leading-5 text-muted sm:px-5 sm:text-xs">
        No aplicativo, o arquivo é salvo em <strong className="font-mono font-medium text-ink">roms/</strong> e pode ser acompanhado em Downloads. Na web, o navegador inicia o download sem sair desta página. {!live && 'Conecte-se à fonte para atualizar os links salvos.'}
      </p>
    </section>
  );
}
