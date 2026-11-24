import { useMemo, useState } from 'react';
import { ArrowDownToLine, Ban, CheckCircle2, CircleX, HardDriveDownload, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDownloads } from '../store/useDownloads';
import { useLibrary } from '../store/useLibrary';
import { sourceLabels, type DownloadStatus, type DownloadTask } from '../types/contracts';
import { shortDate, gamePath } from '../lib/format';
import { Artwork, button, EmptyState } from '../components/ui';
import { desktopApi } from '../api/desktop';
import { PageHeading } from '../components/PageHeading';

type Tab = 'Todos' | 'Em andamento' | 'Concluídos' | 'Cancelados' | 'Falhas';
const tabs: Tab[] = ['Todos', 'Em andamento', 'Concluídos', 'Cancelados', 'Falhas'];
const tabStatuses: Record<Exclude<Tab, 'Todos'>, DownloadStatus[]> = {
  'Em andamento': ['queued', 'downloading'],
  'Concluídos': ['completed'],
  'Cancelados': ['cancelled'],
  'Falhas': ['failed'],
};

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
  if (task.status === 'cancelled') return 'Cancelado';
  return 'Falhou';
}

export function DownloadsPage() {
  const tasks = useDownloads((state) => state.tasks);
  const cancel = useDownloads((state) => state.cancel);
  const notify = useLibrary((state) => state.setNotice);
  const [tab, setTab] = useState<Tab>('Todos');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const visible = useMemo(() => tab === 'Todos' ? tasks : tasks.filter((task) => tabStatuses[tab].includes(task.status)), [tab, tasks]);

  async function cancelTask(id: string) {
    setCancelling(id);
    try { await cancel(id); }
    catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível cancelar o download.'); }
    finally { setCancelling(null); }
  }

  return <div className="space-y-6">
    <PageHeading eyebrow="Arquivos locais" title="Downloads" description="Acompanhe os pacotes baixados pelo aplicativo." icon={ArrowDownToLine} />
    {!desktopApi.available && <div className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3"><HardDriveDownload size={17} className="mt-0.5 shrink-0 text-accent" /><div><p className="text-xs font-medium">Downloads web ficam no navegador</p><p className="mt-1 text-[11px] leading-5 text-muted">Na edição web, o arquivo começa sem abrir outra aba e esta página não recebe o progresso. Progresso e cancelamento integrados estão disponíveis no aplicativo desktop.</p></div></div>}
    <div data-console-tabs className="flex max-w-full gap-1 overflow-x-auto border-b border-line">{tabs.map((name) => {
      const count = name === 'Todos' ? tasks.length : tasks.filter((task) => tabStatuses[name].includes(task.status)).length;
      return <button data-console-tab key={name} onClick={() => setTab(name)} aria-pressed={tab === name} className={`shrink-0 border-b-2 px-3 py-3 text-xs ${tab === name ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}>{name}{count > 0 && <span className="ml-2 text-[10px] tabular-nums">{count}</span>}</button>;
    })}</div>
    {!visible.length ? <EmptyState icon={ArrowDownToLine} title={tasks.length ? `Nenhum download em “${tab}”` : 'Nenhum download por aqui'} description={desktopApi.available ? 'Escolha um arquivo na página de um jogo para iniciar o download em roms/.' : 'Na web, acompanhe os arquivos pelo gerenciador de downloads do navegador.'}>{!tasks.length && <Link to="/explore" className={button}>Explorar jogos</Link>}</EmptyState> : <div className="space-y-3">{visible.map((task) => {
      const active = task.status === 'queued' || task.status === 'downloading';
      const percentage = task.totalBytes && task.totalBytes > 0 ? Math.min(100, task.receivedBytes / task.totalBytes * 100) : null;
      return <article key={task.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <Artwork src={task.icon} title={task.title} className="h-20 w-16 shrink-0 rounded-xl" fit="contain" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{task.title}</h2><p className="mt-1 break-all text-xs text-muted">{task.filename}</p></div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${task.status === 'completed' ? 'bg-success/15 text-success' : task.status === 'failed' ? 'bg-danger/15 text-danger' : task.status === 'cancelled' ? 'bg-hover text-muted' : 'bg-accent/15 text-accent'}`}>{active ? <LoaderCircle size={11} className="animate-spin" /> : task.status === 'completed' ? <CheckCircle2 size={11} /> : task.status === 'failed' ? <CircleX size={11} /> : <Ban size={11} />}{statusLabel(task)}</span></div>
            {active && <div className="mt-4"><div className="h-2 overflow-hidden rounded-full bg-hover"><div className={`h-full rounded-full bg-accent transition-[width] ${percentage === null ? 'w-1/3 animate-pulse' : ''}`} style={percentage === null ? undefined : { width: `${percentage}%` }} /></div><div className="mt-2 flex justify-between gap-3 text-[10px] text-muted"><span>{bytes(task.receivedBytes)}{task.totalBytes !== null && ` de ${bytes(task.totalBytes)}`}</span><span>{percentage === null ? 'Tamanho desconhecido' : `${Math.round(percentage)}%`}</span></div></div>}
            {task.error && <p role="alert" className="mt-3 text-xs text-danger">{task.error}</p>}
            {task.destination && <p className="mt-3 break-all text-[10px] text-muted">Salvo em {task.destination}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] text-muted"><span>{sourceLabels[task.source]}</span><span>{shortDate(task.startedAt)}</span>{task.size && <span>{task.size}</span>}</div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">{active && <button className={button} disabled={cancelling === task.id} onClick={() => void cancelTask(task.id)}>{cancelling === task.id ? <LoaderCircle size={13} className="animate-spin" /> : <Ban size={13} />}Cancelar</button>}<Link to={gamePath({ source: task.source, url: task.gameUrl })} className={button}>Ver jogo</Link></div>
      </article>;
    })}</div>}
  </div>;
}
