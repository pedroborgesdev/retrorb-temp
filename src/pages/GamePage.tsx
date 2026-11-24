import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, BookOpen, Check, ChevronRight, Heart, Star } from 'lucide-react';
import { catalogApi } from '../api/catalog';
import { sourceLabels, sourceSchema, searchResultSchema, type CatalogItem, type Game, type Source } from '../types/contracts';
import { useLibrary } from '../store/useLibrary';
import { formatNumber, itemId, safeUrl } from '../lib/format';
import { Artwork, button, EmptyState, ErrorState, iconButton, primaryButton } from '../components/ui';
import { ScreenshotGallery } from '../components/ScreenshotGallery';
import { DownloadTable } from '../components/DownloadTable';

function GameMetadataPanel({ game, source, consoleName }: { game: Game; source: Source; consoleName: string | null }) {
  const rows = [
    ['Console', consoleName], ['Publicadora', game.publisher], ['Lançamento', game.release_date],
    ['Regiões', game.regions?.join(', ')], ['Avaliação', game.stars_rate == null ? null : `${game.stars_rate}`],
    ['Avaliações recebidas', game.reviews_count == null ? null : formatNumber(game.reviews_count)], ['Fonte', sourceLabels[source]],
  ];
  return <aside className="min-w-0 self-start rounded-2xl border border-line bg-surface p-5 sm:p-6"><h2 className="mb-5 text-base font-semibold">Informações do jogo</h2><dl className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 xl:grid-cols-1">{rows.filter(([, value]) => value != null && value !== '').map(([label, value]) => <div key={label}><dt className="text-[11px] text-muted">{label}</dt><dd className="mt-1 break-words text-sm leading-5">{value}</dd></div>)}</dl></aside>;
}

function ExpandableDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const id = useId();
  useEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    const measure = () => setLong(element.scrollHeight > parseFloat(getComputedStyle(element).lineHeight) * 8 + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description]);
  return <div className="max-w-[72ch]">
    <p ref={paragraph} id={id} className={`whitespace-pre-line break-words text-sm leading-7 text-muted ${!expanded ? 'line-clamp-8' : ''}`}>{description}</p>
    {long && <button type="button" aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="mt-3 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{expanded ? 'Mostrar menos' : 'Ver descrição completa'}</button>}
  </div>;
}

export function GamePage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const parsedSource = sourceSchema.safeParse(params.get('source'));
  const source = parsedSource.success ? parsedSource.data : 'romsfun';
  const url = params.get('url') || '';
  const saved = useLibrary((s) => s.entries.find((e) => e.source === source && e.url === url));
  const stateItem = searchResultSchema.safeParse(location.state?.item);
  const seed = stateItem.success ? stateItem.data : saved;
  const valid = parsedSource.success && Boolean(safeUrl(url));
  const result = useQuery({ queryKey: ['game', source, url], queryFn: ({ signal }) => catalogApi.game(source, url, signal), enabled: valid, retry: false, staleTime: 30_000, refetchOnWindowFocus: false });
  const save = useLibrary((s) => s.save);
  const favorite = useLibrary((s) => s.toggleFavorite);
  const game = result.data?.game || saved?.game;
  if (!valid) return <EmptyState title="Endereço de jogo inválido" description="Selecione um jogo nos resultados de pesquisa."><Link to="/explore" className={button}>Voltar para explorar</Link></EmptyState>;
  if (!game) return result.error ? <ErrorState message={result.error.message} retry={() => void result.refetch()} loading={result.isFetching} /> : <div role="status" aria-label="Carregando detalhes do jogo" className="space-y-6 motion-safe:animate-pulse"><div className="h-64 rounded-lg bg-surface" /><div className="grid grid-cols-3 gap-6"><div className="col-span-2 h-80 rounded-lg bg-surface" /><div className="h-60 rounded-lg bg-surface" /></div><p className="text-xs text-muted">Consultando os detalhes e arquivos na fonte…</p></div>;
  const item: CatalogItem = { source, url, title: game.name || seed?.title || null, icon: game.icon || seed?.icon || null, console: seed?.console || null, size: seed?.size || null, downloads: seed?.downloads ?? null };
  return <div className="space-y-8">
    <nav aria-label="Localização" className="flex items-center gap-2 pt-1 text-xs text-muted"><Link to="/explore" className="hover:text-ink">Explorar</Link><ChevronRight size={12} /><span>{sourceLabels[source]}</span><ChevronRight size={12} /><span className="truncate text-ink">{item.title || 'Detalhes do jogo'}</span></nav>
    {result.error && <><ErrorState message={result.error.message} retry={() => void result.refetch()} loading={result.isFetching} /><p className="text-xs text-muted">Exibindo informações salvas na biblioteca local.</p></>}
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7"><div className="flex flex-col gap-6 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-8"><div className="mx-auto w-[220px] max-w-full shrink-0 rounded-xl border border-line bg-canvas p-3 min-[900px]:mx-0"><Artwork src={item.icon} title={item.title || 'Capa do jogo'} className="mx-auto aspect-[3/4] max-h-[320px] w-full rounded-lg" fit="contain" /></div><div className="min-w-0 flex-1"><span className="inline-flex rounded-md border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-muted">{item.console || 'Console não informado'}</span><h1 className="mt-3 break-words text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">{item.title || 'Título indisponível'}</h1><div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">{game.publisher && <span>{game.publisher}</span>}{game.release_date && <span>{game.release_date}</span>}{game.stars_rate != null && <span className="flex items-center gap-1.5"><Star size={14} className="text-brand-gold" fill="currentColor" />{game.stars_rate}{game.reviews_count != null && <span>({formatNumber(game.reviews_count)} avaliações)</span>}</span>}</div><div className="mt-6 flex flex-wrap gap-2"><a href="#game-files" onClick={(e) => { e.preventDefault(); document.getElementById('game-files')?.scrollIntoView({ block: 'start' }); }} className={`${primaryButton} min-h-10 rounded-lg px-4`}><ArrowDownToLine size={15} />Ver arquivos</a><button className={`${button} min-h-10 rounded-lg px-4`} onClick={() => save(item, game)} disabled={saved?.inLibrary}>{saved?.inLibrary ? <Check size={14} /> : <BookOpen size={14} />}{saved?.inLibrary ? 'Na biblioteca' : 'Adicionar à biblioteca'}</button><button className={`${iconButton} border border-line bg-hover ${saved?.favorite ? 'text-danger' : ''}`} aria-label={saved?.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} aria-pressed={Boolean(saved?.favorite)} onClick={() => favorite(item, game)}><Heart size={16} fill={saved?.favorite ? 'currentColor' : 'none'} /></button></div><p className="mt-4 text-[11px] text-muted">Fonte: {sourceLabels[source]}</p></div></div></section>
    <ScreenshotGallery key={itemId(item)} images={game.screenshots} />
    <div className="grid items-start gap-6 min-[1000px]:grid-cols-[minmax(0,7fr)_minmax(240px,3fr)]"><section className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6"><h2 className="mb-4 text-base font-semibold">Sobre este jogo</h2><ExpandableDescription key={itemId(item)} description={game.description || 'Esta fonte não disponibilizou uma descrição para este jogo.'} /></section><GameMetadataPanel game={game} source={source} consoleName={item.console} /></div>
    <DownloadTable files={game.downloads} item={item} live={Boolean(result.data) && !result.isError} />
  </div>;
}
