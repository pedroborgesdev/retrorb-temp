import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, Compass, LoaderCircle, Search, SlidersHorizontal, Layers3 } from 'lucide-react';
import { sources, sourceLabels, sourceSchema, type Source } from '../types/contracts';
import { useCatalog, useConsoles, type SourceQuery } from '../hooks/useCatalog';
import { useLibrary } from '../store/useLibrary';
import { filterAndSort, type Sort } from '../lib/format';
import { GameCollection, ViewToggle } from '../components/GameCollection';
import { button, EmptyState, ErrorState, select, SkeletonLoader } from '../components/ui';
import { PageHeading } from '../components/PageHeading';

function SourceSection({ result, sort }: { result: SourceQuery; sort: Sort }) {
  const view = useLibrary((s) => s.preferences.view);
  const items = filterAndSort(result.items, '', sort);
  return <section aria-label={`Resultados ${sourceLabels[result.source]}`} className="space-y-4">
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2"><h2 className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink">{sourceLabels[result.source]}<span className="text-[10px] font-normal text-muted">{result.items.length} carregados</span></h2>{result.isFetching && <LoaderCircle className="shrink-0 animate-spin text-muted" size={14} aria-label="Consultando fonte" />}</div>
    {result.isPending && <SkeletonLoader list={view === 'list'} />}
    {items.length > 0 && <GameCollection items={items} />}
    {result.error && <ErrorState message={result.error.message} loading={result.isFetching} retry={() => { if (result.isFetchNextPageError) void result.fetchNextPage(); else void result.refetch(); }} />}
    {!result.isPending && !result.error && !items.length && <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-xs text-muted">Nenhum jogo encontrado nesta fonte.</div>}
    {result.hasNextPage && !result.isFetchNextPageError && <div className="flex justify-center"><button disabled={result.isFetching} onClick={() => void result.fetchNextPage()} className={button}>{result.isFetchingNextPage ? <LoaderCircle size={13} className="animate-spin" /> : <ArrowDown size={13} />}Carregar mais de {sourceLabels[result.source]}</button></div>}
  </section>;
}

export function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') || '').trim();
  const sourceValue = sourceSchema.safeParse(params.get('source'));
  const selected: Source | 'all' = sourceValue.success ? sourceValue.data : 'all';
  const catalog = useConsoles();
  const consoleName = params.get('console') || '';
  const consoleEntry = catalog.data?.consoles.find((entry) => entry.name === consoleName);
  const results = useCatalog(query, selected, consoleName, consoleEntry?.providers.map((provider) => provider.name));
  const enabled = useLibrary((s) => s.preferences.enabledSources);
  const recents = useLibrary((s) => s.recents);
  const [sort, setSort] = useState<Sort>('relevance');
  const all = results.flatMap((result) => result.items);
  const consoles = catalog.data?.consoles ?? [];
  function setConsole(name: string) {
    const next = new URLSearchParams(params);
    if (name) next.set('console', name); else next.delete('console');
    setParams(next);
  }
  function choose(source: Source | 'all') { const next = new URLSearchParams(params); if (source === 'all') next.delete('source'); else next.set('source', source); setParams(next); }
  return <div className="space-y-6">
    <PageHeading eyebrow="Descubra sua próxima aventura" title={query ? `Resultados para “${query}”${consoleName ? ` · ${consoleName}` : ''}` : consoleName ? `Jogos de ${consoleName}` : 'Explorar jogos'} description={query || consoleName ? `${all.length} resultados carregados · ${results.length} ${results.length === 1 ? 'fonte selecionada' : 'fontes selecionadas'}` : 'Encontre seus clássicos favoritos.'} icon={Compass} />
    {catalog.error && <ErrorState message={catalog.error.message} loading={catalog.isFetching} retry={() => void catalog.refetch()} />}
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-inset p-3"><SlidersHorizontal size={14} className="text-muted" /><select aria-label="Filtrar por console" value={consoleName} onChange={(e) => setConsole(e.target.value)} className={select}><option value="">Todos os consoles</option>{consoleName && !consoleEntry && <option value={consoleName}>{consoleName}</option>}{consoles.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}</select><select aria-label="Ordenação" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={select}><option value="relevance">Ordem da fonte</option><option value="name">Nome: A–Z</option><option value="downloads">Mais downloads</option><option value="size">Maior tamanho</option></select><label className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-xs text-muted focus-within:outline-2 focus-within:outline-accent"><Layers3 size={14} /><span className="sr-only">Fontes</span><select aria-label="Filtrar fonte" value={selected} onChange={(e) => choose(e.target.value as Source | 'all')} className="min-w-24 bg-transparent text-ink outline-none"><option value="all">Todas as fontes</option>{sources.map((source) => <option key={source} value={source}>{sourceLabels[source]}{!enabled.includes(source) ? ' (off)' : ''}</option>)}</select></label><span className="hidden text-[10px] text-muted lg:block">{consoleName ? 'Jogos do console selecionado' : 'Ordenação dos resultados carregados'}</span><div className="ml-auto"><ViewToggle /></div></div>
    {consoleName && catalog.isPending ? <SkeletonLoader /> : consoleName && catalog.error ? null : consoleName && !consoleEntry ? <EmptyState title="Console não encontrado" description="Selecione uma plataforma disponível no catálogo."><Link to="/consoles" className={button}>Ver consoles</Link></EmptyState> : !results.length ? <EmptyState title="Nenhuma fonte disponível" description="Selecione outra fonte ou habilite uma fonte compatível nas configurações."><Link to="/settings" className={button}>Configurar fontes</Link></EmptyState> : !query && !consoleName ? <div className="pt-5"><EmptyState icon={Search} title="Qual jogo ficou na sua memória?" description="Digite um nome no campo de pesquisa acima. Os resultados aparecem separados por fonte, enquanto você explora."><button className={button} onClick={() => { document.querySelector<HTMLInputElement>('[aria-label="Pesquisar jogos"]')?.focus(); }}>Pesquisar jogos<kbd className="text-[9px] text-muted">Ctrl K</kbd></button></EmptyState>{recents.length > 0 && <div className="mt-6 flex flex-wrap justify-center gap-2">{recents.map((recent) => <Link key={recent} className={button} to={`/explore?${new URLSearchParams({ q: recent, ...(selected !== 'all' ? { source: selected } : {}) })}`}>{recent}</Link>)}</div>}</div> : <div className="space-y-8">{results.map((result) => <SourceSection key={result.source} result={result} sort={sort} />)}</div>}
  </div>;
}
