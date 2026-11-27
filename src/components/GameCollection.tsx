import { memo, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpRight, Heart, LayoutGrid, List, Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatNumber, gamePath, itemId, safeUrl } from '../lib/format';
import { prefetchCoverAccent } from '../lib/dominantColor';
import { sourceLabels, type CatalogItem, type Source } from '../types/contracts';
import { useLibrary } from '../store/useLibrary';
import { Artwork, iconButton } from './ui';

const sourceAccents: Record<Source, { bar: string; border: string; dot: string }> = {
  romsfun: { bar: 'bg-brand-coral', border: 'hover:border-brand-coral/55', dot: 'bg-brand-coral' },
  romspure: { bar: 'bg-brand-orange', border: 'hover:border-brand-orange/55', dot: 'bg-brand-orange' },
  romsgames: { bar: 'bg-brand-teal', border: 'hover:border-brand-teal/55', dot: 'bg-brand-teal' },
  wowroms: { bar: 'bg-brand-gold', border: 'hover:border-brand-gold/55', dot: 'bg-brand-gold' },
};

export function ViewToggle() {
  const view = useLibrary((s) => s.preferences.view);
  const set = useLibrary((s) => s.setPreferences);
  return <div className="flex gap-1 rounded-xl border border-line bg-surface p-0.5 sm:p-1" aria-label="Visualização">
    <button aria-label="Visualização em grade" aria-pressed={view === 'grid'} className={`${iconButton} size-7 rounded-lg sm:size-8 ${view === 'grid' ? 'bg-accent/15 text-accent' : ''}`} onClick={() => set({ view: 'grid' })}><LayoutGrid size={14} /></button>
    <button aria-label="Visualização em lista" aria-pressed={view === 'list'} className={`${iconButton} size-7 rounded-lg sm:size-8 ${view === 'list' ? 'bg-accent/15 text-accent' : ''}`} onClick={() => set({ view: 'list' })}><List size={15} /></button>
  </div>;
}

export function GameCard({ item, list = false, denseMobile = false, stagger }: { item: CatalogItem; list?: boolean; denseMobile?: boolean; stagger?: number }) {
  const favorite = useLibrary((s) => s.entries.some((e) => e.id === itemId(item) && e.favorite));
  const toggle = useLibrary((s) => s.toggleFavorite);
  const valid = safeUrl(item.url);
  const title = item.title || 'Título indisponível';
  const tone = sourceAccents[item.source];
  const hasDownloads = item.downloads != null && Number.isFinite(item.downloads);
  const content = <>
    <div className="relative shrink-0 overflow-hidden rounded-xl">
      <Artwork src={item.icon} title={title} fit="contain" className={`${list ? 'h-16 w-12 rounded-xl bg-inset/70 p-1 sm:h-20 sm:w-16' : denseMobile ? 'aspect-[4/5] w-full rounded-lg bg-inset/70 p-1.5 sm:rounded-xl sm:p-3' : 'aspect-[5/6] w-full rounded-xl bg-inset/70 p-2 sm:aspect-[4/5] sm:p-3'} transition-transform duration-200 ease-out group-hover:scale-[1.04]`} />
      {!list && (
        <span className={`absolute inline-flex items-center gap-1 truncate rounded-md border border-line/70 bg-surface/90 font-medium text-ink backdrop-blur-xs ${denseMobile ? 'bottom-1 left-1 max-w-[calc(100%-0.5rem)] px-1 py-0.5 text-[8px] sm:bottom-2 sm:left-2 sm:max-w-[calc(100%-1rem)] sm:px-2 sm:text-[9px]' : 'bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] px-1.5 py-0.5 text-[9px] sm:bottom-2 sm:left-2 sm:px-2'}`}>
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
          <span className="truncate">{sourceLabels[item.source]}</span>
        </span>
      )}
    </div>
    <div className={list ? 'min-w-0 flex-1 py-0.5 pr-8' : denseMobile ? 'flex min-w-0 flex-1 flex-col px-0.5 pb-0.5 pt-1.5 sm:px-1 sm:pb-1 sm:pt-3' : 'flex min-w-0 flex-1 flex-col px-0.5 pb-0.5 pt-2 sm:px-1 sm:pb-1 sm:pt-3'}>
      {list && (
        <p className="mb-0.5 inline-flex items-center gap-1.5 text-[10px] font-medium text-muted">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
          {sourceLabels[item.source]}
        </p>
      )}
      <div className="flex items-start gap-1 sm:gap-2">
        <h3 className={`line-clamp-2 min-w-0 flex-1 font-display font-semibold tracking-tight text-ink ${denseMobile ? 'text-[11px] leading-3.5 sm:text-sm sm:leading-5' : 'text-xs leading-4 sm:text-sm sm:leading-5'}`}>{title}</h3>
        {!list && valid && <ArrowUpRight size={14} aria-hidden className={`mt-0.5 shrink-0 text-muted transition-all duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent ${denseMobile ? 'hidden sm:block' : ''}`} />}
      </div>
      <div className={`mt-1 flex items-center gap-1 text-muted sm:mt-2 sm:gap-1.5 ${denseMobile ? 'text-[9px] sm:text-[11px]' : 'text-[10px] sm:text-[11px]'}`}><Monitor size={11} className="shrink-0" /><span className="truncate">{item.console || 'Console não informado'}</span></div>
      <div className={`mt-auto ${denseMobile ? 'pt-2 sm:pt-3.5' : 'pt-2.5 sm:pt-3.5'} ${list ? 'min-[900px]:hidden' : ''}`}><div className={`flex flex-wrap items-center justify-between gap-1 border-t border-line/80 font-mono text-muted ${denseMobile ? 'pt-1.5 text-[9px] sm:pt-2.5 sm:text-[11px]' : 'pt-2 text-[10px] sm:pt-2.5 sm:text-[11px]'}`}><span className="truncate">{item.size || 'Tamanho —'}</span>{hasDownloads && <span title="Downloads" className="flex items-center gap-1 tabular-nums"><ArrowDownToLine size={10} />{formatNumber(item.downloads)}</span>}</div></div>
      {!valid && <span className="mt-1 block text-[10px] text-muted">Detalhes indisponíveis</span>}
    </div>
    {list && <div className="mr-10 hidden items-center gap-6 font-mono text-xs text-muted min-[900px]:flex sm:mr-12"><span className="w-20 text-right">{item.size || '—'}</span><span title={hasDownloads ? 'Downloads' : undefined} aria-hidden={!hasDownloads || undefined} className="flex w-20 items-center justify-end gap-1.5 tabular-nums">{hasDownloads && <><ArrowDownToLine size={13} />{formatNumber(item.downloads)}</>}</span></div>}
  </>;
  return <article
    style={stagger !== undefined ? ({ '--stagger': stagger } as CSSProperties) : undefined}
    className={`${stagger !== undefined ? 'retro-rise ' : ''}retro-sheen group relative min-w-0 overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-250 ease-out ${denseMobile ? 'p-1.5 sm:p-2.5' : 'p-2 sm:p-2.5'} ${tone.border} hover:bg-hover hover:shadow-xl hover:-translate-y-1.5 focus-within:border-accent focus-within:scale-[1.01] ${list ? '' : 'h-full'}`}
  >
    <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] opacity-40 transition-opacity duration-200 group-hover:opacity-100 ${tone.bar}`} />
    {valid ? <Link to={gamePath(item)} state={{ item }} aria-label={`Ver ${title} em ${sourceLabels[item.source]}`} onMouseEnter={() => prefetchCoverAccent(item.icon)} onFocus={() => prefetchCoverAccent(item.icon)} className={`rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${list ? 'flex items-center gap-3 sm:gap-4' : 'flex h-full flex-col'}`}>{content}</Link> : <div aria-disabled="true" className={list ? 'flex items-center gap-3 sm:gap-4' : 'flex h-full flex-col'}>{content}</div>}
    <button title={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} aria-label={`${favorite ? 'Remover dos' : 'Adicionar aos'} favoritos: ${title}`} aria-pressed={favorite} onClick={() => toggle(item)} className={`absolute flex items-center justify-center rounded-full border shadow-sm transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${denseMobile ? 'right-1.5 top-1.5 size-6 sm:right-3.5 sm:top-3.5 sm:size-8' : 'right-2.5 top-2.5 size-7 sm:right-3.5 sm:top-3.5 sm:size-8'} ${favorite ? 'border-brand-coral/50 bg-brand-coral/15 text-brand-coral hover:bg-brand-coral/25' : 'border-line bg-surface/95 text-muted hover:border-brand-coral/40 hover:text-brand-coral'}`}><Heart size={denseMobile ? 12 : 14} fill={favorite ? 'currentColor' : 'none'} className={favorite ? 'retro-pop' : ''} /></button>
  </article>;
}

export const GameCollection = memo(function GameCollection({ items, layout = 'default', trailingCard }: { items: CatalogItem[]; layout?: 'default' | 'paginated'; trailingCard?: ReactNode }) {
  const view = useLibrary((s) => s.preferences.view);
  const size = useLibrary((s) => s.preferences.cardSize);
  const paginatedCols = size === 'compact'
    ? 'grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-5'
    : 'grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-5';
  const defaultCols = `grid grid-cols-2 gap-2.5 sm:gap-3.5 ${size === 'compact' ? 'min-[900px]:grid-cols-4 min-[1280px]:grid-cols-5 min-[1600px]:grid-cols-6' : 'min-[900px]:grid-cols-3 min-[1100px]:grid-cols-4 min-[1280px]:grid-cols-5 min-[1600px]:grid-cols-6'}`;
  const seenKeys = new Map<string, number>();
  return <div className={view === 'list' ? 'space-y-2' : layout === 'paginated' ? paginatedCols : defaultCols}>
    {items.map((item, i) => {
      const baseKey = itemId(item);
      const count = (seenKeys.get(baseKey) ?? 0) + 1;
      seenKeys.set(baseKey, count);
      const stableKey = count === 1 ? baseKey : `${baseKey}#${count}`;
      return <GameCard key={stableKey} item={item} list={view === 'list'} denseMobile={layout === 'paginated' && view !== 'list'} stagger={i} />;
    })}
    {trailingCard}
  </div>;
});
