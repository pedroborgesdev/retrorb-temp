import { ArrowDownToLine, ArrowUpRight, Heart, LayoutGrid, List, Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatNumber, gamePath, itemId, safeUrl } from '../lib/format';
import { sourceLabels, type CatalogItem } from '../types/contracts';
import { useLibrary } from '../store/useLibrary';
import { Artwork, iconButton } from './ui';

export function ViewToggle() {
  const view = useLibrary((s) => s.preferences.view);
  const set = useLibrary((s) => s.setPreferences);
  return <div className="flex gap-0.5 rounded-md border border-line bg-surface p-0.5" aria-label="Visualização">
    <button aria-label="Visualização em grade" aria-pressed={view === 'grid'} className={`${iconButton} ${view === 'grid' ? 'bg-hover text-ink' : ''}`} onClick={() => set({ view: 'grid' })}><LayoutGrid size={15} /></button>
    <button aria-label="Visualização em lista" aria-pressed={view === 'list'} className={`${iconButton} ${view === 'list' ? 'bg-hover text-ink' : ''}`} onClick={() => set({ view: 'list' })}><List size={16} /></button>
  </div>;
}

export function GameCard({ item, list = false }: { item: CatalogItem; list?: boolean }) {
  const favorite = useLibrary((s) => s.entries.some((e) => e.id === itemId(item) && e.favorite));
  const toggle = useLibrary((s) => s.toggleFavorite);
  const valid = safeUrl(item.url);
  const title = item.title || 'Título indisponível';
  const content = <>
    <div className="relative shrink-0"><Artwork src={item.icon} title={title} fit="contain" className={list ? 'h-20 w-16 rounded-lg p-1' : 'aspect-[4/5] w-full rounded-xl p-3'} />{!list && <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-surface/90 px-1.5 py-0.5 text-[9px] text-muted">{sourceLabels[item.source]}</span>}</div>
    <div className={list ? 'min-w-0 flex-1 py-1 pr-8' : 'flex min-w-0 flex-1 flex-col px-1 pb-1 pt-3'}>
      {list && <p className="mb-1 text-[10px] text-muted">{sourceLabels[item.source]}</p>}
      <div className="flex items-start gap-2"><h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-5 text-ink">{title}</h3>{!list && valid && <ArrowUpRight size={15} aria-hidden className="mt-0.5 shrink-0 text-muted transition-colors group-hover:text-accent" />}</div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Monitor size={12} className="shrink-0" /><span className="truncate">{item.console || 'Console não informado'}</span></div>
      <div className={`mt-auto pt-4 ${list ? 'min-[900px]:hidden' : ''}`}><div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11px] text-muted"><span>{item.size || 'Tamanho —'}</span><span title="Downloads" className="flex items-center gap-1.5 tabular-nums"><ArrowDownToLine size={12} />{formatNumber(item.downloads)}</span></div></div>
      {!valid && <span className="mt-1 block text-[10px] text-muted">Detalhes indisponíveis</span>}
    </div>
    {list && <div className="mr-12 hidden items-center gap-8 text-xs text-muted min-[900px]:flex"><span className="w-20 text-right">{item.size || '—'}</span><span className="flex w-20 items-center justify-end gap-1.5"><ArrowDownToLine size={13} />{formatNumber(item.downloads)}</span></div>}
  </>;
  return <article className={`group relative min-w-0 rounded-xl border border-line bg-surface p-2.5 transition-[background-color,border-color,transform] duration-150 hover:bg-hover focus-within:border-accent motion-safe:focus-within:scale-[1.01] ${list ? '' : 'h-full'}`}>
    {valid ? <Link to={gamePath(item)} state={{ item }} aria-label={`Ver ${title} em ${sourceLabels[item.source]}`} className={`rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${list ? 'flex items-center gap-4' : 'flex h-full flex-col'}`}>{content}</Link> : <div aria-disabled="true" className={list ? 'flex items-center gap-4' : 'flex h-full flex-col'}>{content}</div>}
    <button title={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} aria-label={`${favorite ? 'Remover dos' : 'Adicionar aos'} favoritos: ${title}`} aria-pressed={favorite} onClick={() => toggle(item)} className={`absolute right-4 top-4 flex size-9 items-center justify-center rounded-full border border-line bg-surface/95 shadow-sm transition-colors hover:bg-hover hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${favorite ? 'text-danger' : 'text-muted'}`}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} /></button>
  </article>;
}

export function GameCollection({ items }: { items: CatalogItem[] }) {
  const view = useLibrary((s) => s.preferences.view);
  const size = useLibrary((s) => s.preferences.cardSize);
  return <div className={view === 'list' ? 'space-y-2' : `grid grid-cols-2 gap-3 sm:gap-4 ${size === 'compact' ? 'min-[900px]:grid-cols-4 min-[1280px]:grid-cols-5 min-[1600px]:grid-cols-6' : 'min-[900px]:grid-cols-3 min-[1100px]:grid-cols-4 min-[1280px]:grid-cols-5 min-[1600px]:grid-cols-6'}`}>
    {items.map((item, i) => <GameCard key={`${itemId(item)}:${i}`} item={item} list={view === 'list'} />)}
  </div>;
}
