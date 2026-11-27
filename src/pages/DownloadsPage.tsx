import { useState, type CSSProperties } from 'react';
import { ArrowDownToLine, Ban, CheckCircle2, CircleX, HardDriveDownload, LoaderCircle, RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDownloads } from '../store/useDownloads';
import { useLibrary } from '../store/useLibrary';
import { sourceLabels, type DownloadTask } from '../types/contracts';
import { shortDate, gamePath } from '../lib/format';
import { Artwork, button, EmptyState, Modal } from '../components/ui';
import { desktopApi } from '../api/desktop';
import { PageHeading } from '../components/PageHeading';

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[unit]}`;
}

function statusLabel(task: DownloadTask) {
  if (task.status === 'queued') return 'Preparando';
  if (task.status === 'downloading') return 'Baixando';
  if (task.status === 'completed') return 'Concluído';
  return 'Falhou';
}

export function DownloadsPage() {
  const tasks = useDownloads((state) => state.tasks);
  const cancel = useDownloads((state) => state.cancel);
  const retry = useDownloads((state) => state.retry);
  const notify = useLibrary((state) => state.setNotice);
  const [confirmCancel, setConfirmCancel] = useState<DownloadTask | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function confirmCancelTask() {
    if (!confirmCancel) return;
    const targetId = confirmCancel.id;
    setCancelling(targetId);
    try {
      await cancel(targetId);
      setConfirmCancel(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível cancelar o download.');
    } finally {
      setCancelling(null);
    }
  }

  async function retryTask(id: string) {
    setRetrying(id);
    try {
      await retry(id);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível retomar o download.');
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading eyebrow="Progresso" title="Downloads" description="Acompanhe o progresso dos downloads em andamento." icon={ArrowDownToLine} palette="orange">
        {tasks.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-inset px-2.5 py-1 text-[10px] font-medium text-muted sm:px-3 sm:py-1.5 sm:text-[11px]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-orange" />
            <strong className="font-mono font-semibold tabular-nums text-ink">{tasks.length}</strong>{' '}
            {tasks.length === 1 ? 'download' : 'downloads'}
          </span>
        )}
      </PageHeading>

      {!desktopApi.available && (
        <div className="flex items-start gap-3 rounded-2xl border border-brand-orange/35 bg-surface px-3.5 py-2.5 shadow-sm sm:px-4 sm:py-3">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
            <HardDriveDownload size={16} />
          </span>
          <div>
            <p className="text-xs font-semibold text-ink">Downloads web ficam no navegador</p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted sm:leading-5">
              Na edição web, o arquivo começa sem abrir outra aba e esta página não recebe o progresso. Progresso, retomada e cancelamento integrados estão disponíveis no aplicativo desktop.
            </p>
          </div>
        </div>
      )}

      {!tasks.length ? (
        <EmptyState
          icon={ArrowDownToLine}
          title="Nenhum download por aqui"
          description={
            desktopApi.available
              ? 'Escolha um arquivo na página de um jogo para iniciar o download em roms/.'
              : 'Na web, acompanhe os arquivos pelo gerenciador de downloads do navegador.'
          }
        >
          <Link to="/explore" className={button}>Explorar jogos</Link>
        </EmptyState>
      ) : (
        <div className="space-y-2.5 sm:space-y-3">
          {tasks.map((task, index) => {
            const active = task.status === 'queued' || task.status === 'downloading';
            const failed = task.status === 'failed';
            const showProgress = active || failed;
            const percentage = task.totalBytes && task.totalBytes > 0 ? Math.min(100, (task.receivedBytes / task.totalBytes) * 100) : null;
            const progressWidth = task.status === 'queued' || percentage === null ? 0 : percentage;
            const topBar = task.status === 'completed' ? 'bg-success' : failed ? 'bg-danger' : 'bg-accent';
            const statusTone =
              task.status === 'completed'
                ? 'border-success/30 bg-success/15 text-success'
                : failed
                  ? 'border-danger/30 bg-danger/15 text-danger'
                  : 'border-accent/30 bg-accent/15 text-accent';

            return (
              <article
                key={task.id}
                style={{ '--stagger': index } as CSSProperties}
                className="retro-rise relative overflow-hidden rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-4"
              >
                <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] ${topBar}`} />
                <div className="flex items-start gap-3 sm:gap-4">
                  <Artwork src={task.icon} title={task.title} className="h-14 w-11 shrink-0 rounded-xl bg-inset/70 sm:h-16 sm:w-12" fit="contain" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-xs font-semibold tracking-tight sm:text-sm">
                          <Link to={gamePath({ source: task.source, url: task.gameUrl })} className="text-ink transition-colors hover:text-accent">
                            {task.title}
                          </Link>
                        </h2>
                        <p className="mt-0.5 break-all font-mono text-[11px] text-muted sm:text-xs">{task.filename}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:gap-1.5 sm:px-2.5 sm:py-1 ${statusTone}`}>
                        {active ? (
                          <LoaderCircle size={11} className="animate-spin" />
                        ) : task.status === 'completed' ? (
                          <CheckCircle2 size={11} />
                        ) : (
                          <CircleX size={11} />
                        )}
                        {statusLabel(task)}
                      </span>
                    </div>

                    {showProgress && (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-inset sm:h-2">
                          <div
                            className={`h-full rounded-full transition-[width] duration-300 ease-out ${failed ? 'bg-danger' : 'bg-accent'}`}
                            style={{ width: `${progressWidth}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex justify-between gap-3 font-mono text-[10px] text-muted">
                          <span>
                            {bytes(task.receivedBytes)}
                            {task.totalBytes !== null && ` de ${bytes(task.totalBytes)}`}
                          </span>
                          <span className="tabular-nums">{percentage === null ? 'Tamanho desconhecido' : `${Math.round(percentage)}%`}</span>
                        </div>
                      </div>
                    )}

                    {task.error && <p role="alert" className="mt-2.5 text-xs text-danger">{task.error}</p>}
                    {task.destination && <p className="mt-2.5 break-all font-mono text-[10px] text-muted">Salvo em {task.destination}</p>}

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
                      <span>{sourceLabels[task.source]}</span>
                      <span>{shortDate(task.startedAt)}</span>
                      {task.size && <span className="font-mono">{task.size}</span>}
                    </div>
                  </div>
                </div>

                {(active || failed) && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-2.5">
                    {failed && (
                      <button
                        type="button"
                        disabled={retrying === task.id || cancelling === task.id}
                        onClick={() => void retryTask(task.id)}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-accent shadow-sm transition-all duration-150 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-10 sm:gap-2 sm:px-4 sm:py-2 sm:text-[13px]"
                      >
                        {retrying === task.id ? <LoaderCircle size={13} className="animate-spin" /> : <RotateCw size={13} />}
                        Tentar novamente
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={cancelling === task.id}
                      onClick={() => setConfirmCancel(task)}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] border border-danger/60 bg-danger px-3.5 py-1.5 text-xs font-semibold text-paper shadow-sm transition-all duration-150 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger sm:min-h-10 sm:gap-2 sm:px-4 sm:py-2 sm:text-[13px]"
                    >
                      <Ban size={13} />
                      Cancelar
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {confirmCancel && (
        <Modal
          title="Cancelar download?"
          onClose={() => {
            if (!cancelling) setConfirmCancel(null);
          }}
        >
          <p className="text-xs leading-6 text-muted sm:text-sm">
            Tem certeza de que deseja cancelar o download de{' '}
            <strong className="break-all font-semibold text-ink">“{confirmCancel.filename}”</strong>? O arquivo parcial salvo até o momento será removido.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              className={button}
              disabled={cancelling === confirmCancel.id}
              onClick={() => setConfirmCancel(null)}
            >
              Manter download
            </button>
            <button
              type="button"
              disabled={cancelling === confirmCancel.id}
              onClick={() => void confirmCancelTask()}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] border border-danger/60 bg-danger px-3.5 py-1.5 text-xs font-semibold text-paper shadow-sm transition-all duration-150 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger sm:min-h-10 sm:gap-2 sm:px-4 sm:py-2 sm:text-[13px]"
            >
              {cancelling === confirmCancel.id ? <LoaderCircle size={13} className="animate-spin" /> : <Ban size={13} />}
              Sim, cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
