import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Compass, Gamepad2, Layers3, LoaderCircle, Search, SlidersHorizontal, X } from 'lucide-react';
import { sources, sourceLabels, type Source } from '../types/contracts';
import { useCatalog, useConsoles, type SourceQuery } from '../hooks/useCatalog';
import { useLibrary } from '../store/useLibrary';
import { filterAndSort, type Sort } from '../lib/format';
import { parseSourceFilter, serializeSourceFilter } from '../lib/listbox';
import { EXPLORE_MAX_ITEMS, EXPLORE_PAGE_SIZE, paginateExploreItems } from '../lib/pagination';
import { smoothScrollToElement, smoothScrollToTop } from '../lib/scroll';
import { GameCollection, ViewToggle } from '../components/GameCollection';
import { button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { Listbox } from '../components/Listbox';
import { PageHeading } from '../components/PageHeading';
import { Pagination } from '../components/Pagination';

const sourceDots: Record<Source, string> = {
  romsfun: 'bg-brand-coral',
  romspure: 'bg-brand-orange',
  romsgames: 'bg-brand-teal',
  wowroms: 'bg-brand-gold',
};

const popularConsoles = ['PlayStation 2', 'Nintendo DS', 'Game Boy Advance', 'Super Nintendo Entertainment System', 'PlayStation', 'Nintendo 64'];

function RefineSearchCard() {
  const view = useLibrary((s) => s.preferences.view);
  function focusSearch() {
    smoothScrollToTop(document.getElementById('main-content'));
    const input = document.querySelector<HTMLInputElement>('[aria-label="Pesquisar jogos"]');
    if (input) {
      input.focus({ preventScroll: true });
      input.select();
    }
  }
  if (view === 'list') {
    return (
      <div
        style={{ '--stagger': 14 } as import('react').CSSProperties}
        className="retro-rise retro-sheen relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border border-dashed border-accent/45 bg-surface px-4 py-3.5 shadow-sm"
      >
        <span
          aria-hidden="true"
          className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            backgroundImage:
              'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)',
          }}
        />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent">
            <Search size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink sm:text-sm">Não encontrou o que procurava?</p>
            <p className="mt-0.5 text-[11px] text-muted">Talvez seja melhor refinar a busca com um nome mais específico ou escolher um console.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={focusSearch}
          className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-[10px] bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent shadow-xs transition-all duration-150 hover:brightness-110 active:scale-95"
        >
          <Search size={13} aria-hidden="true" />
          Refinar busca
        </button>
      </div>
    );
  }
  return (
    <div
      style={{ '--stagger': 14 } as import('react').CSSProperties}
      className="retro-rise retro-sheen retro-lume-rim group relative isolate flex h-full min-h-[180px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-dashed border-accent/45 bg-surface p-2.5 text-center shadow-sm transition-all duration-200 hover:border-accent/70 hover:bg-hover sm:p-4"
    >
      <span
        aria-hidden="true"
        className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          backgroundImage:
            'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)',
        }}
      />
      <span
        aria-hidden="true"
        className="retro-lume-wash pointer-events-none absolute inset-0 -z-10 opacity-60 transition-opacity duration-200 group-hover:opacity-100"
      />
      <span
        aria-hidden="true"
        className="retro-grain pointer-events-none absolute inset-0 -z-10"
      />
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent transition-transform duration-200 group-hover:scale-110 sm:size-11 sm:rounded-2xl">
        <Search size={17} />
      </span>
      <div className="space-y-1">
        <p className="text-[11px] font-semibold leading-tight text-ink sm:text-sm">Não encontrou?</p>
        <p className="text-[10px] leading-3.5 text-muted sm:text-xs sm:leading-4">
          Talvez seja melhor refinar a busca ou filtrar pelo console.
        </p>
      </div>
      <button
        type="button"
        onClick={focusSearch}
        className="mt-1 inline-flex min-h-7 items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[10px] font-semibold text-on-accent shadow-xs transition-all duration-150 hover:brightness-110 active:scale-95 sm:min-h-8 sm:gap-1.5 sm:rounded-[10px] sm:px-3 sm:py-1.5 sm:text-xs"
      >
        <Search size={12} aria-hidden="true" />
        Refinar busca
      </button>
    </div>
  );
}

function SourceSection({ result, sort }: { result: SourceQuery; sort: Sort }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [direction, setDirection] = useState<'initial' | 'next' | 'prev'>('initial');

  const ordered = result.isReady ? filterAndSort(result.items, '', sort) : [];
  const {
    page,
    totalPages,
    visibleGameCount,
    pageItems,
    showRefineCard,
    startIndex,
    endIndex,
  } = paginateExploreItems(ordered, result.page, EXPLORE_PAGE_SIZE, EXPLORE_MAX_ITEMS);
  const isLoadingActivePage = !result.isReady;

  useEffect(() => {
    if (result.isReady && result.page > totalPages && ordered.length > 0) {
      result.setPage(totalPages);
    }
  }, [result.isReady, result.page, result.setPage, totalPages, ordered.length]);

  function handlePageChange(nextPage: number) {
    setDirection(nextPage < result.page ? 'prev' : 'next');
    result.setPage(nextPage);
    if (sectionRef.current && sectionRef.current.getBoundingClientRect().top < 72) {
      smoothScrollToElement(sectionRef.current, { offset: 12 });
    }
  }

  return <section ref={sectionRef} id={`source-${result.source}`} aria-label={`Resultados ${sourceLabels[result.source]}`} className="scroll-mt-3 space-y-3 sm:space-y-3.5">
    <div className="relative flex items-center justify-between gap-3 border-b border-line pb-2.5">
      <h2 className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink sm:gap-2.5">
        <span aria-hidden="true" className={`size-2 rounded-full ${sourceDots[result.source]}`} />
        <span>{sourceLabels[result.source]}</span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[10px] font-medium tabular-nums text-muted">
          {!result.isReady ? (result.items.length > 0 ? `Carregando (${Math.min(result.items.length, EXPLORE_MAX_ITEMS)}/${EXPLORE_MAX_ITEMS})…` : 'Consultando…') : `${visibleGameCount} carregados`}
        </span>
        {result.isReady && ordered.length > 0 && (
          <span className="rounded-full border border-line bg-inset px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted">
            Pág. {page}/{totalPages}
          </span>
        )}
      </h2>
      {isLoadingActivePage && <LoaderCircle className="shrink-0 animate-spin text-accent" size={14} aria-label="Consultando fonte" />}
      {isLoadingActivePage && (
        <span
          aria-hidden="true"
          className="retro-spectrum pointer-events-none absolute inset-x-0 -bottom-px h-[2px]"
          style={{
            backgroundImage:
              'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)',
          }}
        />
      )}
    </div>
    {result.isReady && (pageItems.length > 0 || showRefineCard) ? (
      <div
        key={`${result.source}:p${page}:${sort}`}
        className={direction === 'prev' ? 'retro-paginate-prev' : direction === 'next' ? 'retro-paginate-next' : undefined}
      >
        <GameCollection
          items={pageItems}
          layout="paginated"
          trailingCard={showRefineCard ? <RefineSearchCard /> : undefined}
        />
      </div>
    ) : null}
    {result.error && <ErrorState message={result.error.message} loading={result.isFetching} retry={() => { if (result.isFetchNextPageError) void result.fetchNextPage(); else void result.refetch(); }} />}
    {result.isReady && !result.isFetching && !result.error && !ordered.length && <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-4 py-8 text-center text-xs text-muted">Nenhum jogo encontrado nesta fonte.</div>}
    {result.isReady && (
      <Pagination
        label={`Paginação ${sourceLabels[result.source]}`}
        page={page}
        totalLoadedPages={totalPages}
        hasMore={false}
        isLoadingMore={false}
        totalItems={visibleGameCount}
        startIndex={startIndex}
        endIndex={endIndex}
        onPageChange={handlePageChange}
      />
    )}
  </section>;
}

export function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') || '').trim();
  const catalog = useConsoles();
  const consoleName = params.get('console') || '';
  const consoleEntry = catalog.data?.consoles.find((entry) => entry.name === consoleName);
  const enabled = useLibrary((s) => s.preferences.enabledSources);
  const sourceParam = params.get('source');
  const selectedSources = parseSourceFilter(sourceParam, enabled);
  const results = useCatalog(query, selectedSources, consoleName, consoleEntry?.providers.map((provider) => provider.name));
  const recents = useLibrary((s) => s.recents);
  const [sort, setSort] = useState<Sort>('downloads');
  function changeSort(nextSort: Sort) {
    results.forEach((result) => result.setPage(1));
    setSort(nextSort);
  }
  const visibleCountFor = (count: number) => (count >= EXPLORE_MAX_ITEMS ? EXPLORE_MAX_ITEMS - 1 : count);
  const allCount = results.reduce((sum, result) => sum + (result.isReady ? visibleCountFor(result.items.length) : 0), 0);
  const consoles = catalog.data?.consoles ?? [];
  const quickConsoles = popularConsoles.flatMap((name) => consoles.find((entry) => entry.name === name) ?? []);
  const quickPick = (quickConsoles.length ? quickConsoles : consoles).slice(0, 6);
  function setConsole(name: string) {
    const next = new URLSearchParams(params);
    if (name) next.set('console', name); else next.delete('console');
    setParams(next);
  }
  function chooseSources(nextSources: Source[]) {
    const next = new URLSearchParams(params);
    const serialized = serializeSourceFilter(nextSources, enabled);
    if (serialized === null) next.delete('source');
    else next.set('source', serialized);
    setParams(next);
  }
  function resetFilters() {
    const next = new URLSearchParams(params);
    next.delete('console');
    next.delete('source');
    setParams(next);
  }
  const hasFilters = Boolean(consoleName || sourceParam);
  const showingResults = !(consoleName && (catalog.isPending || catalog.error || !consoleEntry)) && results.length > 0 && Boolean(query || consoleName);
  return <div className="space-y-4 sm:space-y-5">
    <PageHeading
      eyebrow="Descubra sua próxima aventura"
      title={query ? `Resultados para “${query}”${consoleName ? ` · ${consoleName}` : ''}` : consoleName ? `Jogos de ${consoleName}` : 'Explorar jogos'}
      description={query || consoleName ? `${allCount} resultados carregados · ${results.length} ${results.length === 1 ? 'fonte selecionada' : 'fontes selecionadas'}` : 'Encontre seus clássicos favoritos.'}
      icon={Compass}
      palette="orange"
    >
      {(query || consoleName) && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-inset px-2.5 py-1 text-[10px] font-medium text-muted sm:px-3 sm:py-1.5 sm:text-[11px]">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
          <strong className="font-semibold tabular-nums text-ink">{allCount}</strong> resultados · {results.length} {results.length === 1 ? 'fonte' : 'fontes'}
        </span>
      )}
    </PageHeading>
    {catalog.error && <ErrorState message={catalog.error.message} loading={catalog.isFetching} retry={() => void catalog.refetch()} />}
    <div className="retro-rise flex flex-col gap-2 rounded-2xl border border-line bg-inset/70 p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5 sm:p-3" style={{ '--stagger': 1 } as import('react').CSSProperties}>
      <SlidersHorizontal size={14} className="hidden shrink-0 text-muted sm:block" />
      <div className="grid grid-cols-2 gap-1.5 sm:contents">
        <Listbox
          ariaLabel="Filtrar por console"
          value={consoleName}
          onChange={setConsole}
          className="w-full sm:w-auto"
          options={[
            { value: '', label: 'Todos os consoles' },
            ...(consoleName && !consoleEntry ? [{ value: consoleName, label: consoleName }] : []),
            ...consoles.map((entry) => ({ value: entry.name, label: entry.name })),
          ]}
        />
        <Listbox<Sort>
          ariaLabel="Ordenação"
          value={sort}
          onChange={changeSort}
          className="w-full sm:w-auto"
          options={[
            { value: 'downloads', label: 'Mais downloads' },
            { value: 'relevance', label: 'Ordem da fonte' },
            { value: 'name', label: 'Nome: A–Z' },
            { value: 'size', label: 'Maior tamanho' },
          ]}
        />
      </div>
      <div className="flex items-center gap-1.5 sm:contents">
        <Listbox<Source>
          multiple
          ariaLabel="Filtrar fonte"
          icon={Layers3}
          values={selectedSources}
          onChange={chooseSources}
          className="min-w-0 flex-1 sm:w-auto sm:flex-none"
          allLabel="Todas as fontes"
          noneLabel="Nenhuma fonte"
          formatSummary={(selected, total) =>
            selected.length === 0
              ? 'Nenhuma fonte'
              : selected.length === total
                ? 'Todas as fontes'
                : selected.length === 1
                  ? selected[0].label
                  : `${selected.length} fontes`
          }
          options={sources.map((source) => ({
            value: source,
            label: `${sourceLabels[source]}${!enabled.includes(source) ? ' (off)' : ''}`,
            disabled: !enabled.includes(source),
          }))}
        />
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-line bg-surface px-2.5 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-ink sm:h-10"
            aria-label="Limpar filtros"
          >
            <X size={13} />
            <span className="hidden sm:inline">Limpar</span>
          </button>
        )}
        <div className="shrink-0 sm:ml-auto"><ViewToggle /></div>
      </div>
    </div>
    {showingResults && results.length > 1 && (
      <nav aria-label="Ir para fonte" className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {results.map((result) => (
          <button
            key={result.source}
            type="button"
            onClick={() => smoothScrollToElement(document.getElementById(`source-${result.source}`), { offset: 12 })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:border-accent/50 hover:bg-hover active:scale-95"
          >
            <span aria-hidden="true" className={`size-1.5 rounded-full ${sourceDots[result.source]}`} />
            <span>{sourceLabels[result.source]}</span>
            {!result.isReady ? (
              <LoaderCircle size={11} className="animate-spin text-accent" aria-hidden="true" />
            ) : result.error ? (
              <span className="text-[10px] font-bold text-danger" aria-hidden="true">!</span>
            ) : (
              <span className="rounded bg-inset px-1 py-0.2 text-[10px] tabular-nums text-muted">{visibleCountFor(result.items.length)}</span>
            )}
          </button>
        ))}
      </nav>
    )}
    {consoleName && catalog.isPending ? <LoadingState label="Carregando catálogo…" ariaLabel="Carregando jogos" /> : consoleName && catalog.error ? null : consoleName && !consoleEntry ? <EmptyState title="Console não encontrado" description="Selecione uma plataforma disponível no catálogo."><Link to="/consoles" className={button}>Ver consoles</Link></EmptyState> : !results.length ? <EmptyState title="Nenhuma fonte disponível" description="Selecione outra fonte ou habilite uma fonte compatível nas configurações."><Link to="/settings" className={button}>Configurar fontes</Link></EmptyState> : !query && !consoleName ? <div className="space-y-4 pt-1"><EmptyState icon={Search} title="Qual jogo ficou na sua memória?" description="Digite um nome no campo de pesquisa acima. Os resultados aparecem separados por fonte, enquanto você explora."><button className={button} onClick={() => { document.querySelector<HTMLInputElement>('[aria-label="Pesquisar jogos"]')?.focus(); }}>Pesquisar jogos<kbd className="hidden text-[9px] text-muted sm:inline">Ctrl K</kbd></button></EmptyState>{recents.length > 0 && <div className="space-y-2"><p className="text-[11px] font-medium text-muted">Buscas recentes</p><div className="flex flex-wrap gap-1.5">{recents.map((recent) => <Link key={recent} className={`${button} min-h-8 px-2.5 py-1 text-xs`} to={`/explore?${new URLSearchParams({ q: recent, ...(sourceParam ? { source: sourceParam } : {}) })}`}>{recent}</Link>)}</div></div>}{quickPick.length > 0 && <div className="space-y-2"><p className="text-[11px] font-medium text-muted">Plataformas populares</p><div className="flex flex-wrap gap-1.5">{quickPick.map((entry) => <Link key={entry.name} className={`${button} min-h-8 px-2.5 py-1 text-xs`} to={`/explore?${new URLSearchParams({ console: entry.name, ...(sourceParam ? { source: sourceParam } : {}) })}`}><Gamepad2 size={12} className="text-accent" />{entry.name}</Link>)}</div></div>}</div> : <div className="space-y-6 sm:space-y-7">{results.map((result) => <SourceSection key={result.source} result={result} sort={sort} />)}</div>}
  </div>;
}
