import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, BookOpen, Check, ChevronDown, ChevronRight, ChevronUp, Globe, HardDrive, Heart, LoaderCircle, Monitor, RotateCw, Sparkles, Star } from 'lucide-react';
import { aiApi, DEFAULT_HF_MODEL } from '../api/ai';
import { catalogApi, type GameStreamStage } from '../api/catalog';
import { sourceLabels, sourceSchema, searchResultSchema, type CatalogItem, type Game, type GameResponse, type Source } from '../types/contracts';
import { useLibrary } from '../store/useLibrary';
import { formatNumber, itemId, safeUrl } from '../lib/format';
import { buildCoverAccentTheme, extractCoverAccent, peekCoverAccent, type RgbColor } from '../lib/dominantColor';
import { parseMarkdown } from '../lib/markdown';
import { smoothScrollToElement } from '../lib/scroll';
import { Artwork, button, EmptyState, ErrorState, iconButton, LoadingState } from '../components/ui';
import { MarkdownContent } from '../components/MarkdownContent';
import { ScreenshotGallery } from '../components/ScreenshotGallery';
import { DownloadTable } from '../components/DownloadTable';

const sourceGlows: Record<Source, { dot: string; lume: string }> = {
  romsfun: { dot: 'bg-brand-coral', lume: 'var(--retro-coral)' },
  romspure: { dot: 'bg-brand-orange', lume: 'var(--retro-orange)' },
  romsgames: { dot: 'bg-brand-teal', lume: 'var(--retro-teal)' },
  wowroms: { dot: 'bg-brand-gold', lume: 'var(--retro-gold)' },
};

function GameMetadataPanel({
  game,
  source,
  consoleName,
  size,
  downloads,
  detailsLoading = false,
  filesLoading = false,
}: {
  game?: Game;
  source: Source;
  consoleName: string | null;
  size: string | null;
  downloads: number | null;
  detailsLoading?: boolean;
  filesLoading?: boolean;
}) {
  const tone = sourceGlows[source];
  const hasDownloads = downloads != null && Number.isFinite(downloads);
  const fileCount = game?.downloads?.length ?? 0;

  const rows: Array<{ label: string; value: ReactNode; animate?: boolean }> = [];
  if (consoleName) {
    rows.push({
      label: 'Console',
      value: (
        <Link to={`/explore?console=${encodeURIComponent(consoleName)}`} className="font-medium text-ink transition-colors hover:text-accent">
          {consoleName}
        </Link>
      ),
    });
  }
  rows.push({
    label: 'Fonte',
    value: (
      <span className="inline-flex items-center gap-1.5 font-medium text-ink">
        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
        {sourceLabels[source]}
      </span>
    ),
  });
  if (game?.publisher) rows.push({ label: 'Publicadora', value: game.publisher, animate: true });
  if (game?.release_date) rows.push({ label: 'Lançamento', value: game.release_date, animate: true });
  if (game?.regions?.length) rows.push({ label: 'Regiões', value: game.regions.join(', '), animate: true });
  if (size) rows.push({ label: 'Tamanho', value: size });
  if (hasDownloads) rows.push({ label: 'Downloads', value: formatNumber(downloads) });
  if (fileCount > 0) {
    rows.push({ label: 'Arquivos', value: String(fileCount), animate: true });
  } else if (!detailsLoading && filesLoading) {
    rows.push({
      label: 'Arquivos',
      value: (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <LoaderCircle size={11} className="animate-spin text-accent" aria-hidden="true" />
          Buscando…
        </span>
      ),
    });
  }

  return (
    <aside
      className="retro-rise min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm lg:sticky lg:top-4"
      style={{ '--stagger': 2 } as CSSProperties}
    >
      <div className="border-b border-line bg-inset/40 px-4 py-3">
        <h2 className="font-display text-sm font-semibold tracking-tight text-ink">Ficha técnica</h2>
      </div>
      <SmoothHeight>
        {game?.stars_rate != null && (
          <div className="retro-field-in flex items-center justify-between gap-2 border-b border-line/70 bg-brand-gold/10 px-4 py-2.5">
            <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums text-ink">
              <Star size={14} className="text-brand-gold" fill="currentColor" />
              {game.stars_rate}
            </span>
            {game.reviews_count != null && (
              <span className="text-xs tabular-nums text-muted">
                {formatNumber(game.reviews_count)} {game.reviews_count === 1 ? 'avaliação' : 'avaliações'}
              </span>
            )}
          </div>
        )}
        <dl className="divide-y divide-line/60 px-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className={`flex items-baseline justify-between gap-3 py-2.5 text-xs ${row.animate ? 'retro-field-in' : ''}`}
            >
              <dt className="shrink-0 text-muted">{row.label}</dt>
              <dd className="min-w-0 break-words text-right font-medium text-ink">{row.value}</dd>
            </div>
          ))}
          {detailsLoading && (
            <div aria-hidden="true" className="retro-skeleton-group divide-y divide-line/60">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <span className="h-2.5 w-20 rounded-full bg-hover" />
                <span className="h-2.5 w-24 rounded-full bg-hover" />
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <span className="h-2.5 w-16 rounded-full bg-hover" />
                <span className="h-2.5 w-16 rounded-full bg-hover" />
              </div>
            </div>
          )}
        </dl>
      </SmoothHeight>
    </aside>
  );
}

function SmoothHeight({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    let timerId: number | undefined;

    const release = () => {
      outer.style.height = 'auto';
      outer.style.overflow = '';
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === outer && event.propertyName === 'height') {
        if (timerId !== undefined) window.clearTimeout(timerId);
        release();
      }
    };

    outer.addEventListener('transitionend', onTransitionEnd);

    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.height ?? inner.getBoundingClientRect().height);
      const prev = prevHeightRef.current;
      if (prev === null) {
        prevHeightRef.current = next;
        return;
      }
      if (Math.abs(next - prev) < 1) return;

      if (timerId !== undefined) window.clearTimeout(timerId);
      outer.style.height = `${prev}px`;
      outer.style.overflow = 'hidden';
      void outer.offsetHeight;
      outer.style.height = `${next}px`;
      prevHeightRef.current = next;
      timerId = window.setTimeout(release, 360);
    });

    observer.observe(inner);

    return () => {
      observer.disconnect();
      outer.removeEventListener('transitionend', onTransitionEnd);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, []);

  return (
    <div ref={outerRef} className="transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

function SourceDescriptionSkeleton() {
  return (
    <div className="space-y-3 py-1" role="status" aria-live="polite" aria-label="Carregando descrição do jogo">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <LoaderCircle size={13} className="animate-spin text-accent" aria-hidden="true" />
        <span>Buscando descrição na fonte…</span>
      </div>
      <div className="retro-skeleton-group space-y-2.5">
        <div className="h-2.5 w-full rounded-full bg-hover" />
        <div className="h-2.5 w-11/12 rounded-full bg-hover" />
        <div className="h-2.5 w-5/6 rounded-full bg-hover" />
        <div className="h-2.5 w-2/3 rounded-full bg-hover" />
      </div>
    </div>
  );
}

function AiDescriptionSkeleton({ model }: { model: string }) {
  return (
    <div className="space-y-4 py-1" role="status" aria-live="polite" aria-label={`Gerando descrição com ${model}…`}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Sparkles size={13} className="text-accent" aria-hidden="true" />
        <span>Gerando descrição com {model}…</span>
      </div>
      <div className="retro-skeleton-group space-y-4">
        <div className="space-y-2.5">
          <div className="h-3.5 w-32 rounded-full bg-hover" />
          <div className="h-2.5 w-full rounded-full bg-hover" />
          <div className="h-2.5 w-11/12 rounded-full bg-hover" />
          <div className="h-2.5 w-3/4 rounded-full bg-hover" />
        </div>
        <div className="space-y-2.5">
          <div className="h-3.5 w-28 rounded-full bg-hover" />
          <div className="h-2.5 w-5/6 rounded-full bg-hover" />
          <div className="h-2.5 w-2/3 rounded-full bg-hover" />
        </div>
      </div>
    </div>
  );
}

function ExpandableDescription({ markdown, animate = false }: { markdown: string; animate?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const id = useId();
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  const isSingleParagraph = blocks.length === 1 && blocks[0].type === 'paragraph';

  useEffect(() => {
    const target = isSingleParagraph ? paragraph.current : container.current;
    if (!target) return;
    const measure = () => {
      if (isSingleParagraph) {
        setLong(target.scrollHeight > parseFloat(getComputedStyle(target).lineHeight) * 8 + 1);
      } else {
        setLong(target.scrollHeight > 356);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [markdown, isSingleParagraph]);

  return (
    <div className={isSingleParagraph ? 'max-w-[72ch]' : 'w-full'}>
      <div
        ref={!isSingleParagraph ? container : undefined}
        id={!isSingleParagraph ? id : undefined}
        className={`relative ${!isSingleParagraph && !expanded ? 'max-h-[22rem] overflow-hidden' : ''}`}
      >
        <MarkdownContent
          blocks={blocks}
          paragraphRef={paragraph}
          paragraphId={isSingleParagraph ? id : undefined}
          clampSingleParagraph={isSingleParagraph && !expanded}
          animate={animate}
        />
        {long && !expanded && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent" />
        )}
      </div>
      {long && (
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-sm"
        >
          {expanded ? 'Mostrar menos' : 'Ver descrição completa'}
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

export function GamePage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const parsedSource = sourceSchema.safeParse(params.get('source'));
  const source = parsedSource.success ? parsedSource.data : 'romsfun';
  const url = params.get('url') || '';
  const rawFile = params.get('file');
  const parsedFileIndex = rawFile !== null && /^\d+$/.test(rawFile) ? Number.parseInt(rawFile, 10) : null;
  const saved = useLibrary((s) => s.entries.find((e) => e.source === source && e.url === url));
  const hfApiKey = useLibrary((s) => s.preferences.hfApiKey);
  const hfModel = useLibrary((s) => s.preferences.hfModel);
  const theme = useLibrary((s) => s.preferences.theme);
  const activeModel = hfModel.trim() || DEFAULT_HF_MODEL;
  const stateItem = searchResultSchema.safeParse(location.state?.item);
  const seed = stateItem.success ? stateItem.data : saved;
  const valid = parsedSource.success && Boolean(safeUrl(url));
  const queryKeyId = `${source}:${url}`;
  const [streamState, setStreamState] = useState<{
    key: string;
    data: GameResponse | null;
    stage: 'idle' | GameStreamStage;
  }>({ key: queryKeyId, data: null, stage: 'idle' });
  const result = useQuery({
    queryKey: ['game', source, url],
    queryFn: ({ signal }) =>
      catalogApi.gameStream(
        source,
        url,
        (stage, payload) => {
          setStreamState({ key: queryKeyId, data: payload, stage });
        },
        signal,
      ),
    enabled: valid,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const save = useLibrary((s) => s.save);
  const favorite = useLibrary((s) => s.toggleFavorite);
  const streamed = streamState.key === queryKeyId ? streamState.data : null;
  const streamedStage = streamState.key === queryKeyId ? streamState.stage : 'idle';
  const activeGame: Game | undefined = result.data?.game || streamed?.game || saved?.game;
  const detailsReady = Boolean(result.data || (streamed && streamedStage !== 'idle') || saved?.game || result.isError);
  const downloadsReady = Boolean(
    result.data || (streamed && streamedStage === 'done') || result.isError || (saved?.game && !result.isFetching),
  );
  const hasLiveDownloadsList = Boolean(result.data?.game.downloads || streamed?.game.downloads);
  const loadingFiles = !downloadsReady && !hasLiveDownloadsList && !saved?.game;
  const resolvingLinks = !downloadsReady && hasLiveDownloadsList;
  const hasHfKey = Boolean(hfApiKey.trim());
  const [descriptionMode, setDescriptionMode] = useState<'source' | 'ai'>(() => (hasHfKey ? 'ai' : 'source'));
  const [hasSwitchedMode, setHasSwitchedMode] = useState(false);
  const [userPickedAi, setUserPickedAi] = useState(false);
  const [allowServerToken, setAllowServerToken] = useState(false);
  const themeCoverUrl = safeUrl(seed?.icon) || safeUrl(activeGame?.icon);
  const [coverAccent, setCoverAccent] = useState<{
    url: string | null;
    rgb: RgbColor | null;
    done: boolean;
  }>(() => {
    const cached = peekCoverAccent(themeCoverUrl);
    return { url: themeCoverUrl, rgb: cached.color, done: !themeCoverUrl || cached.hit };
  });
  const [coverWaitExpired, setCoverWaitExpired] = useState(false);

  useEffect(() => {
    setCoverWaitExpired(false);
    if (!themeCoverUrl) {
      setCoverAccent({ url: null, rgb: null, done: true });
      return;
    }

    const cached = peekCoverAccent(themeCoverUrl);
    if (cached.hit) {
      setCoverAccent({ url: themeCoverUrl, rgb: cached.color, done: true });
      return;
    }

    setCoverAccent({ url: themeCoverUrl, rgb: null, done: false });
    const controller = new AbortController();
    void extractCoverAccent(themeCoverUrl, controller.signal).then((rgb) => {
      if (!controller.signal.aborted) {
        setCoverAccent({ url: themeCoverUrl, rgb, done: true });
      }
    });
    return () => controller.abort();
  }, [themeCoverUrl]);

  const cachedCover = peekCoverAccent(themeCoverUrl);
  const activeDominantRgb = cachedCover.hit
    ? cachedCover.color
    : coverAccent.url === themeCoverUrl
      ? coverAccent.rgb
      : null;
  const isCoverPending =
    Boolean(themeCoverUrl) &&
    !cachedCover.hit &&
    (coverAccent.url !== themeCoverUrl || !coverAccent.done);

  useEffect(() => {
    if ((!activeGame && !seed) || !isCoverPending) return;
    const timer = window.setTimeout(() => setCoverWaitExpired(true), 1500);
    return () => window.clearTimeout(timer);
  }, [activeGame, seed, isCoverPending]);

  const coverTheme = useMemo(
    () => (activeDominantRgb ? buildCoverAccentTheme(activeDominantRgb, theme) : null),
    [activeDominantRgb, theme],
  );
  const scopedThemeStyle = coverTheme
    ? ({
        '--retro-accent': coverTheme.accent,
        '--retro-on-accent': coverTheme.onAccent,
        '--retro-orange': coverTheme.accent,
      } as CSSProperties)
    : undefined;

  useEffect(() => {
    setDescriptionMode(hasHfKey ? 'ai' : 'source');
    setHasSwitchedMode(false);
    setUserPickedAi(false);
    setAllowServerToken(false);
  }, [source, url, hasHfKey]);

  useEffect(() => {
    if (parsedFileIndex === null || !activeGame?.downloads?.length) return;
    const frame = window.requestAnimationFrame(() => {
      smoothScrollToElement(document.getElementById('game-files'), { offset: 16 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [parsedFileIndex, activeGame?.downloads?.length]);

  const canRequestAi = hasHfKey || allowServerToken;
  const aiTitle = (activeGame?.name || seed?.title || '').trim();
  const sourceDescription = activeGame?.description ?? null;
  const aiQuery = useQuery({
    queryKey: ['ai-description', source, url, activeModel, sourceDescription ?? ''],
    queryFn: ({ signal }) =>
      aiApi.describeGame(
        {
          apiKey: hfApiKey,
          model: activeModel,
          title: aiTitle,
          console: seed?.console || null,
          sourceDescription,
        },
        signal,
      ),
    enabled: Boolean(valid && detailsReady && !result.isError && aiTitle && (hasHfKey || (descriptionMode === 'ai' && allowServerToken))),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (descriptionMode === 'ai' && !userPickedAi && aiQuery.isError) {
      setDescriptionMode('source');
    }
  }, [descriptionMode, userPickedAi, aiQuery.isError]);

  const selectSourceMode = () => {
    setHasSwitchedMode(true);
    setUserPickedAi(false);
    setDescriptionMode('source');
  };

  const selectAiMode = () => {
    setHasSwitchedMode(true);
    setUserPickedAi(true);
    setDescriptionMode('ai');
    if (aiQuery.isError && canRequestAi) {
      void aiQuery.refetch();
    }
  };
  if (!valid) return <EmptyState title="Endereço de jogo inválido" description="Selecione um jogo nos resultados de pesquisa."><Link to="/explore" className={button}>Voltar para explorar</Link></EmptyState>;
  if (!activeGame && !seed) {
    return result.error ? (
      <ErrorState message={result.error.message} retry={() => void result.refetch()} loading={result.isFetching} />
    ) : (
      <div style={scopedThemeStyle}>
        <LoadingState label="Consultando os detalhes e arquivos na fonte…" ariaLabel="Carregando detalhes do jogo" />
      </div>
    );
  }
  if (isCoverPending && !coverWaitExpired) {
    return <LoadingState label="Preparando a página do jogo…" ariaLabel="Carregando detalhes do jogo" />;
  }

  const item: CatalogItem = {
    source,
    url,
    title: activeGame?.name || seed?.title || null,
    icon: activeGame?.icon || seed?.icon || null,
    console: seed?.console || null,
    size: seed?.size || null,
    downloads: seed?.downloads ?? null,
  };
  const tone = sourceGlows[source];
  const effectiveSize = item.size || activeGame?.downloads?.find((file) => file.size)?.size || null;
  const hasDownloads = item.downloads != null && Number.isFinite(item.downloads);
  const subtitleParts = [activeGame?.publisher, activeGame?.release_date].filter(Boolean);
  const aiUnavailable = aiQuery.data?.available === false;
  const heroLume = coverTheme?.accent ?? tone.lume;

  return (
    <div style={scopedThemeStyle} className="space-y-4 transition-colors duration-300 sm:space-y-5">
      <nav aria-label="Localização" className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Link to="/explore" className="transition-colors hover:text-ink">Explorar</Link>
        <ChevronRight size={12} className="shrink-0 text-muted/70" />
        {item.console && (
          <>
            <Link to={`/explore?console=${encodeURIComponent(item.console)}`} className="max-w-[180px] truncate transition-colors hover:text-ink">
              {item.console}
            </Link>
            <ChevronRight size={12} className="shrink-0 text-muted/70" />
          </>
        )}
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
          {sourceLabels[source]}
        </span>
        <ChevronRight size={12} className="shrink-0 text-muted/70" />
        <span className="min-w-0 truncate font-medium text-ink">{item.title || 'Detalhes do jogo'}</span>
      </nav>

      {result.error && (
        <>
          <ErrorState message={result.error.message} retry={() => void result.refetch()} loading={result.isFetching} />
          {saved?.game && <p className="text-xs text-muted">Exibindo informações salvas na biblioteca local.</p>}
        </>
      )}

      <section
        style={{ '--lume-color': heroLume } as CSSProperties}
        className="retro-rise retro-lume-rim relative isolate overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 lg:p-6"
      >
        <div
          aria-hidden="true"
          className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            backgroundImage: coverTheme
              ? `linear-gradient(90deg, ${coverTheme.accent} 0%, ${coverTheme.secondary} 50%, ${coverTheme.accent} 100%)`
              : 'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="retro-lume-wash pointer-events-none absolute inset-0 -z-10"
          style={{ '--lume-color': heroLume } as CSSProperties}
        />
        <div
          aria-hidden="true"
          className="retro-grain pointer-events-none absolute inset-0 -z-10"
        />

        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-3.5 sm:grid-cols-[152px_minmax(0,1fr)] sm:gap-x-6 sm:gap-y-0 lg:grid-cols-[168px_minmax(0,1fr)]">
          <div className="row-span-1 self-start rounded-xl border border-line/80 bg-inset/80 p-1.5 shadow-sm transition-transform duration-200 hover:scale-[1.02] sm:row-span-2 sm:self-center">
            <Artwork src={item.icon} title={item.title || 'Capa do jogo'} className="mx-auto aspect-[3/4] max-h-[124px] w-full rounded-lg bg-surface/60 sm:max-h-[224px] sm:rounded-xl" fit="contain" />
          </div>

          <div className="min-w-0 self-center">
            <div className="flex flex-wrap items-center gap-1.5">
              {item.console ? (
                <Link
                  to={`/explore?console=${encodeURIComponent(item.console)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-inset/80 px-2.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink"
                >
                  <Monitor size={11} className="shrink-0" />
                  {item.console}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-inset/80 px-2.5 py-0.5 text-[11px] font-medium text-muted">
                  <Monitor size={11} className="shrink-0" />
                  Console não informado
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-inset/80 px-2.5 py-0.5 text-[11px] font-medium text-muted">
                <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
                {sourceLabels[source]}
              </span>
            </div>

            <h1 className="mt-2 break-words font-display text-lg font-semibold leading-tight tracking-tight text-ink sm:text-2xl lg:text-[28px]">
              {item.title || 'Título indisponível'}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
              {subtitleParts.length > 0 && <span className="retro-field-in">{subtitleParts.join(' · ')}</span>}
              {activeGame?.stars_rate != null && (
                <span className="retro-field-in inline-flex items-center gap-1 rounded-full border border-brand-gold/30 bg-brand-gold/12 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-ink">
                  <Star size={11} className="text-brand-gold" fill="currentColor" />
                  {activeGame.stars_rate}
                  {activeGame.reviews_count != null && <span className="text-muted">({formatNumber(activeGame.reviews_count)})</span>}
                </span>
              )}
              {effectiveSize && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <HardDrive size={12} className="shrink-0" />
                  {effectiveSize}
                </span>
              )}
              {hasDownloads && (
                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                  <ArrowDownToLine size={12} className="shrink-0" />
                  {formatNumber(item.downloads)}
                </span>
              )}
              {Boolean(activeGame?.regions?.length) && (
                <span className="retro-field-in inline-flex items-center gap-1">
                  <Globe size={12} className="shrink-0" />
                  {activeGame?.regions?.join(', ')}
                </span>
              )}
              {!detailsReady && (
                <span aria-hidden="true" className="retro-skeleton-group inline-flex items-center gap-2">
                  <span className="h-3 w-24 rounded-full bg-hover" />
                  <span className="h-3 w-14 rounded-full bg-hover" />
                </span>
              )}
            </div>
          </div>

          <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3 sm:col-span-1 sm:mt-4 sm:pt-3.5">
            <a
              href="#game-files"
              aria-label="Ver arquivos"
              onClick={(e) => {
                e.preventDefault();
                smoothScrollToElement(document.getElementById('game-files'), { offset: 16 });
              }}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-accent shadow-md transition-all duration-150 hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-10 sm:gap-2 sm:px-4 sm:py-2 sm:text-[13px]"
            >
              <ArrowDownToLine size={14} />
              Ver arquivos
              {Boolean(activeGame?.downloads?.length) ? (
                <span aria-hidden="true" className="retro-field-in rounded bg-black/15 px-1.5 py-0.2 font-mono text-[10px] tabular-nums">
                  {activeGame?.downloads?.length}
                </span>
              ) : loadingFiles ? (
                <LoaderCircle size={12} className="animate-spin opacity-80" aria-hidden="true" />
              ) : null}
            </a>
            <button className={`${button} rounded-[10px]`} onClick={() => save(item, activeGame)} disabled={saved?.inLibrary}>
              {saved?.inLibrary ? <Check size={14} className="retro-pop" /> : <BookOpen size={14} />}
              {saved?.inLibrary ? 'Na biblioteca' : 'Adicionar à biblioteca'}
            </button>
            <button
              className={`${iconButton} border ${saved?.favorite ? 'border-brand-coral/50 bg-brand-coral/15 text-brand-coral hover:bg-brand-coral/25' : 'border-line bg-inset text-muted hover:border-brand-coral/40 hover:text-brand-coral'}`}
              aria-label={saved?.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              aria-pressed={Boolean(saved?.favorite)}
              onClick={() => favorite(item, activeGame)}
            >
              <Heart size={15} fill={saved?.favorite ? 'currentColor' : 'none'} className={saved?.favorite ? 'retro-pop' : ''} />
            </button>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_304px]">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <SmoothHeight>
            <ScreenshotGallery key={itemId(item)} images={activeGame?.screenshots ?? null} />
          </SmoothHeight>
          <section
            className="retro-rise grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5"
            style={{ '--stagger': 1 } as CSSProperties}
          >
            <h2 className="font-display text-sm font-semibold tracking-tight text-ink sm:text-base">Sobre este jogo</h2>
            {!aiUnavailable && (
              <div
                role="group"
                aria-label="Origem da descrição"
                className="relative inline-grid grid-cols-2 rounded-xl border border-line bg-inset/80 p-0.5 text-[11px] font-medium"
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[9px] transition-[transform,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    descriptionMode === 'ai'
                      ? 'translate-x-full bg-accent shadow-xs'
                      : 'translate-x-0 bg-surface shadow-xs'
                  }`}
                />
                <button
                  type="button"
                  aria-pressed={descriptionMode === 'source'}
                  onClick={selectSourceMode}
                  className={`relative z-10 inline-flex min-w-[66px] items-center justify-center rounded-[9px] px-2.5 py-1 transition-colors duration-200 ${
                    descriptionMode === 'source' ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  Fonte
                </button>
                <button
                  type="button"
                  aria-pressed={descriptionMode === 'ai'}
                  onClick={selectAiMode}
                  className={`relative z-10 inline-flex min-w-[66px] items-center justify-center gap-1 rounded-[9px] px-2.5 py-1 transition-colors duration-200 ${
                    descriptionMode === 'ai' ? 'text-on-accent' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Sparkles
                    size={12}
                    aria-hidden="true"
                    className={`transition-transform duration-300 ${descriptionMode === 'ai' ? 'scale-110' : 'scale-100'}`}
                  />
                  IA
                </button>
              </div>
            )}
            <div className="col-span-full min-w-0">
              <SmoothHeight>
                {aiUnavailable ? (
                  <div key="unavailable" className="retro-ai-block">
                    <p className="text-sm leading-7 text-muted">
                      Não foi possível coletar informações sobre este jogo.
                    </p>
                  </div>
                ) : descriptionMode === 'source' ? (
                  !detailsReady ? (
                    <SourceDescriptionSkeleton key="source-loading" />
                  ) : (
                    <div key="source" className={`space-y-3 ${hasSwitchedMode ? 'retro-desc-from-left' : 'retro-field-in'}`}>
                      <ExpandableDescription
                        key={`source:${itemId(item)}`}
                        markdown={activeGame?.description || 'Esta fonte não disponibilizou uma descrição para este jogo.'}
                      />
                      {!activeGame?.description && (
                        <div>
                          <button
                            type="button"
                            onClick={selectAiMode}
                            className={`${button} rounded-[10px]`}
                          >
                            <Sparkles size={13} className="text-accent" aria-hidden="true" />
                            Gerar descrição com IA
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div key="ai" className={hasSwitchedMode ? 'retro-desc-from-right' : ''}>
                    {!canRequestAi ? (
                      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line bg-inset/50 p-4">
                        <div className="flex items-start gap-2.5">
                          <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                          <div className="space-y-1 text-xs leading-5 text-muted">
                            <div className="font-medium text-ink">Chave do Hugging Face não configurada</div>
                            <div>
                              Informe sua chave em Configurações → IA para gerar descrições com o modelo{' '}
                              <code className="rounded border border-line bg-surface px-1 py-0.5 font-mono text-[11px] text-ink">{activeModel}</code>.
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to="/settings?tab=ia"
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-accent shadow-sm transition-all duration-150 hover:brightness-110"
                          >
                            Configurar IA
                          </Link>
                          <button
                            type="button"
                            className={button}
                            onClick={() => setAllowServerToken(true)}
                          >
                            Tentar com chave do servidor
                          </button>
                        </div>
                      </div>
                    ) : !detailsReady || aiQuery.isPending ? (
                      <AiDescriptionSkeleton model={activeModel} />
                    ) : aiQuery.error ? (
                      <div className="space-y-3">
                        <ErrorState
                          message={aiQuery.error.message}
                          retry={() => void aiQuery.refetch()}
                          loading={aiQuery.isFetching}
                        />
                        <div>
                          <Link to="/settings?tab=ia" className="text-xs font-medium text-accent hover:underline">
                            Configurar IA
                          </Link>
                        </div>
                      </div>
                    ) : aiQuery.data && aiQuery.data.available ? (
                      <div key={`ai-ready:${aiQuery.dataUpdatedAt}`} className="space-y-3">
                        <ExpandableDescription
                          key={`ai:${itemId(item)}:${aiQuery.data.model}:${aiQuery.dataUpdatedAt}`}
                          markdown={aiQuery.data.description}
                          animate
                        />
                        <div
                          className="retro-ai-block flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5 text-[11px] text-muted"
                          style={{ '--ai-step': 6 } as CSSProperties}
                        >
                          <span>
                            Gerado por <strong className="font-mono font-medium text-ink">{aiQuery.data.model}</strong>
                          </span>
                          <button
                            type="button"
                            disabled={aiQuery.isFetching}
                            onClick={() => void aiQuery.refetch()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-inset/80 px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-hover disabled:opacity-40"
                          >
                            <RotateCw size={12} className={aiQuery.isFetching ? 'animate-spin' : ''} aria-hidden="true" />
                            Regerar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </SmoothHeight>
            </div>
          </section>
        </div>
        <GameMetadataPanel
          game={activeGame}
          source={source}
          consoleName={item.console}
          size={effectiveSize}
          downloads={item.downloads}
          detailsLoading={!detailsReady}
          filesLoading={loadingFiles}
        />
      </div>

      <DownloadTable
        files={activeGame?.downloads ?? null}
        item={item}
        live={Boolean(result.data || streamed) && !result.isError}
        highlightedFileIndex={parsedFileIndex}
        loadingFiles={loadingFiles}
        resolvingLinks={resolvingLinks}
      />
    </div>
  );
}
