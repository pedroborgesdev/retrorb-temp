import { useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, UNSAFE_LocationContext, useLocation, useNavigate, useOutlet, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, Compass, Gamepad2, Heart, Home, PanelLeftClose, PanelLeftOpen, Maximize2, Minus, Search, Settings2, X } from 'lucide-react';
import { desktopApi } from '../api/desktop';
import { catalogApi, isRomCode } from '../api/catalog';
import { useLibrary } from '../store/useLibrary';
import { iconButton } from './ui';
import { AppLogo } from './AppLogo';
import { themeVariables } from '../lib/colors';
import { cancelSmoothScroll, smoothScrollToTop } from '../lib/scroll';
import { ConsoleNavigation } from './ConsoleNavigation';
import { useDownloads } from '../store/useDownloads';

function TitleBar() {
  return <div className="relative flex h-9 shrink-0 select-none items-center justify-between border-b border-line bg-sidebar text-muted">
    <div
      aria-hidden="true"
      className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[2px]"
      style={{
        backgroundImage:
          'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)',
      }}
    />
    <div className={`flex h-full flex-1 items-center px-5 ${desktopApi.available ? '[-webkit-app-region:drag]' : ''}`}><AppLogo variant="retrorb" className="size-5" decorative /></div>
    {desktopApi.available ? <div className="flex h-full [-webkit-app-region:no-drag]">
      <button onClick={() => desktopApi.windowAction('minimize')} aria-label="Minimizar" className="px-4 transition-colors hover:bg-hover"><Minus size={13} /></button>
      <button onClick={() => desktopApi.windowAction('maximize')} aria-label="Maximizar ou restaurar" className="px-4 transition-colors hover:bg-hover"><Maximize2 size={11} /></button>
      <button onClick={() => desktopApi.windowAction('close')} aria-label="Fechar janela" className="px-4 transition-colors hover:bg-brand-coral hover:text-brand-ink"><X size={14} /></button>
    </div> : <span className="px-5 font-mono text-[10px]">Edição web</span>}
  </div>;
}

function Sidebar() {
  const [expanded, setExpanded] = useState(true);
  const libraryCount = useLibrary((s) => s.entries.filter((e) => e.inLibrary).length);
  const favoritesCount = useLibrary((s) => s.entries.filter((e) => e.favorite).length);
  const activeDownloads = useDownloads((s) => s.tasks.filter((t) => t.status === 'queued' || t.status === 'downloading').length);
  const discoverLinks = [
    { to: '/', label: 'Início', icon: Home, count: 0 },
    { to: '/explore', label: 'Explorar', icon: Compass, count: 0 },
    { to: '/consoles', label: 'Consoles', icon: Gamepad2, count: 0 },
  ];
  const collectionLinks = [
    { to: '/library', label: 'Biblioteca', icon: BookOpen, count: libraryCount },
    { to: '/favorites', label: 'Favoritos', icon: Heart, count: favoritesCount },
    { to: '/downloads', label: 'Downloads', icon: ArrowDownToLine, count: activeDownloads, pulse: true },
  ];
  const labelClass = expanded ? 'hidden min-[1280px]:block' : 'hidden';
  const renderLink = ({ to, label, icon: Icon, count, pulse }: { to: string; label: string; icon: typeof Home; count: number; pulse?: boolean }) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      title={label}
      aria-label={label}
      className={({ isActive }) => `group relative flex h-10 items-center gap-3 rounded-xl border px-3 text-[13px] font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent ${isActive ? 'border-accent/25 bg-accent/12 text-accent shadow-xs' : 'border-transparent text-muted hover:bg-hover hover:text-ink'}`}
    >
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-accent" />}
          <Icon size={18} className="shrink-0 transition-transform duration-150 group-hover:scale-110" />
          <span className={`min-w-0 flex-1 truncate ${labelClass}`}>{label}</span>
          {count > 0 && (
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink ${pulse ? 'border-accent/40 bg-accent/20 text-accent' : 'border-accent/30 bg-accent/15'} ${labelClass}`}>
              {count}
            </span>
          )}
          {pulse && count > 0 && (
            <span aria-hidden="true" className={`size-1.5 rounded-full bg-accent animate-pulse ${expanded ? 'min-[1280px]:hidden' : ''}`} />
          )}
        </>
      )}
    </NavLink>
  );

  return <aside aria-label="Menu principal" className={`hidden md:flex w-[68px] shrink-0 flex-col overflow-y-auto border-r border-line bg-sidebar transition-[width] duration-300 ease-out ${expanded ? 'min-[1280px]:w-[212px]' : ''}`}>
    <Link to="/" aria-label="RetroOrb — Início" className="group flex h-16 shrink-0 items-center justify-center px-3 transition-transform duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent">
      <AppLogo variant="retrorb" className={`size-9 transition-transform duration-200 group-hover:rotate-[-4deg] group-hover:scale-105 ${expanded ? 'min-[1280px]:hidden' : ''}`} decorative />
      {expanded && <AppLogo variant="retrorb-extended" className="hidden h-10 w-full transition-transform duration-200 group-hover:scale-[1.03] min-[1280px]:block" decorative />}
    </Link>
    <nav aria-label="Navegação principal" className="flex-1 space-y-4 px-2.5 pt-1">
      <div className="space-y-1">
        <p className={`px-3 pb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70 ${labelClass}`}>Descobrir</p>
        {discoverLinks.map(renderLink)}
      </div>
      <div className="space-y-1">
        <p className={`px-3 pb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70 ${labelClass}`}>Coleção</p>
        {collectionLinks.map(renderLink)}
      </div>
    </nav>
    <div className="mt-auto space-y-1 border-t border-line/60 px-2.5 py-3">
      <button data-console-menu aria-label={expanded ? 'Recolher navegação' : 'Expandir navegação'} title={expanded ? 'Recolher navegação' : 'Expandir navegação'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="group hidden h-10 w-full items-center gap-3 rounded-xl px-3 text-xs text-muted transition-all duration-150 hover:bg-hover hover:text-ink active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent min-[1280px]:flex">{expanded ? <PanelLeftClose size={18} className="shrink-0 transition-transform duration-150 group-hover:scale-110" /> : <PanelLeftOpen size={18} className="shrink-0 transition-transform duration-150 group-hover:scale-110" />}<span className={labelClass}>Recolher menu</span></button>
      <NavLink to="/settings" title="Configurações" aria-label="Configurações" className={({ isActive }) => `group relative flex h-10 items-center gap-3 rounded-xl border px-3 text-[13px] font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent ${isActive ? 'border-accent/25 bg-accent/12 text-accent shadow-xs' : 'border-transparent text-muted hover:bg-hover hover:text-ink'}`}>
        {({ isActive }) => (
          <>
            {isActive && <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-accent" />}
            <Settings2 size={18} className="shrink-0 transition-transform duration-150 group-hover:rotate-45 group-hover:scale-110" />
            <span className={labelClass}>Configurações</span>
          </>
        )}
      </NavLink>
    </div>
  </aside>;
}

function MobileBottomNav() {
  const libraryCount = useLibrary((s) => s.entries.filter((e) => e.inLibrary).length);
  const activeDownloads = useDownloads((s) => s.tasks.filter((t) => t.status === 'queued' || t.status === 'downloading').length);
  const items = [
    { to: '/', label: 'Início', icon: Home },
    { to: '/explore', label: 'Explorar', icon: Compass },
    { to: '/consoles', label: 'Consoles', icon: Gamepad2 },
    { to: '/library', label: 'Biblioteca', icon: BookOpen, badge: libraryCount },
    { to: '/downloads', label: 'Downloads', icon: ArrowDownToLine, activeDot: activeDownloads > 0 },
  ];
  return (
    <div className="relative z-30 h-[54px] shrink-0 border-t border-line bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div
        aria-hidden="true"
        className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[1.5px] opacity-55"
        style={{
          backgroundImage:
            'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)',
        }}
      />
      <nav aria-label="Navegação móvel" className="grid h-full grid-cols-5 items-center px-1">
        {items.map(({ to, label, icon: Icon, badge, activeDot }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={label}
            className={({ isActive }) => `relative flex h-full flex-col items-center justify-center gap-1 rounded-lg px-1 transition-colors duration-150 active:scale-95 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${isActive ? 'text-accent' : 'text-muted hover:text-ink'}`}
          >
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden="true" className="absolute top-0 h-[2px] w-6 rounded-full bg-accent" />}
                <span className="relative">
                  <Icon size={17} strokeWidth={isActive ? 2.25 : 1.85} />
                  {badge != null && badge > 0 && (
                    <span aria-hidden="true" className="absolute -right-2.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold tabular-nums text-on-accent">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  {activeDot && (
                    <span aria-hidden="true" className="absolute -right-1 -top-1 size-2 rounded-full bg-accent animate-pulse" />
                  )}
                </span>
                <span className="truncate text-[10px] font-medium leading-none">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQuery = params.get('q') || '';
  const [value, setValue] = useState(urlQuery);
  const field = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const codeAbort = useRef<AbortController | undefined>(undefined);
  const selected = params.get('source');
  const addRecent = useLibrary((s) => s.addRecent);
  const notify = useLibrary((s) => s.setNotice);
  const favoritesCount = useLibrary((s) => s.entries.filter((e) => e.favorite).length);
  const activeDownloads = useDownloads((s) => s.tasks.filter((t) => t.status === 'queued' || t.status === 'downloading').length);
  useEffect(() => { setValue(urlQuery); clearTimeout(timer.current); }, [urlQuery, location.pathname, location.search]);
  useEffect(() => () => { clearTimeout(timer.current); codeAbort.current?.abort(); }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); field.current?.focus(); field.current?.select(); }
      if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1); }
      if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); navigate(1); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  async function submit(query: string, replace: boolean) {
    clearTimeout(timer.current);
    const q = query.trim();
    if (isRomCode(q)) {
      codeAbort.current?.abort();
      const controller = new AbortController();
      codeAbort.current = controller;
      try {
        const ref = await catalogApi.resolveRomCode(q, controller.signal);
        if (controller.signal.aborted) return;
        navigate(`/game?source=${ref.source}&url=${encodeURIComponent(ref.game_url)}&file=${ref.file_index}`);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        notify(error instanceof Error ? error.message : 'Código de ROM inválido.');
      }
      return;
    }
    if (q) addRecent(q);
    navigate(`/explore?${new URLSearchParams({ ...(q ? { q } : {}), ...(selected ? { source: selected } : {}), ...(params.get('console') ? { console: params.get('console')! } : {}) })}`, { replace });
  }
  return <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-canvas px-2.5 md:h-14 md:gap-3 md:px-5 lg:px-7">
    <div className="flex shrink-0 items-center gap-1"><button title="Voltar (Alt+←)" aria-label="Voltar" className={`${iconButton} size-8 sm:size-8 md:size-9`} onClick={() => navigate(-1)}><ArrowLeft size={16} /></button><span className="hidden items-center md:inline-flex"><button title="Avançar" aria-label="Avançar" className={`${iconButton} md:size-9`} onClick={() => navigate(1)}><ArrowRight size={16} /></button></span></div>
    <form role="search" className="relative mx-auto min-w-0 flex-1 md:max-w-[520px]" onSubmit={(event) => { event.preventDefault(); void submit(value, false); }}>
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted md:left-3" />
      <input ref={field} aria-label="Pesquisar jogos" maxLength={200} value={value} onChange={(event) => {
        const next = event.target.value; setValue(next); clearTimeout(timer.current);
        timer.current = setTimeout(() => void submit(next, location.pathname === '/explore'), 450);
      }} placeholder="Encontre um clássico ou cole um código RO1-..." className="h-8 w-full rounded-xl border border-line bg-inset/90 pl-8 pr-7 text-xs text-ink shadow-inner transition-colors duration-150 placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent md:h-9 md:pl-9 md:pr-14 md:text-[13px]" />
      {value ? <button type="button" aria-label="Limpar pesquisa" onClick={() => { setValue(''); void submit('', true); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-hover hover:text-ink"><X size={13} /></button> : <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[9px] text-muted md:block">Ctrl K</kbd>}
    </form>
    <div className="flex shrink-0 items-center gap-0.5 md:hidden">
      <NavLink to="/favorites" aria-label="Favoritos" title="Favoritos" className={({ isActive }) => `${iconButton} relative size-8 sm:size-8 ${isActive ? 'bg-brand-coral/15 text-brand-coral' : ''}`}>
        <Heart size={16} />
        {favoritesCount > 0 && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand-coral" />}
      </NavLink>
      <NavLink to="/settings" aria-label="Configurações" title="Configurações" className={({ isActive }) => `${iconButton} size-8 sm:size-8 ${isActive ? 'bg-accent/15 text-accent' : ''}`}>
        <Settings2 size={16} />
      </NavLink>
    </div>
    <div className="ml-auto hidden items-center gap-1.5 md:flex">
      <Link to="/downloads" aria-label="Downloads" title="Downloads" className={`${iconButton} relative md:size-9`}>
        <ArrowDownToLine size={17} />
        {activeDownloads > 0 && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent animate-pulse" />}
      </Link>
      <div className="mx-1 h-4 w-px bg-line" />
      <Link to="/settings" aria-label="Configurações" className={`${iconButton} md:size-9`}><Settings2 size={17} /></Link>
    </div>
  </header>;
}

function AnimatedOutlet({ mainRef }: { mainRef: RefObject<HTMLElement | null> }) {
  const location = useLocation();
  const liveLocationContext = useContext(UNSAFE_LocationContext);
  const currentOutlet = useOutlet();
  const routeKey = location.pathname === '/game' ? `${location.pathname}${location.search}` : location.pathname;

  const [displayedKey, setDisplayedKey] = useState(routeKey);
  const settledRef = useRef({ outlet: currentOutlet, locationContext: liveLocationContext });
  const prevExploreSearchRef = useRef(location.search);

  const isExiting = routeKey !== displayedKey;
  if (!isExiting) {
    settledRef.current = { outlet: currentOutlet, locationContext: liveLocationContext };
  }

  useEffect(() => {
    if (!isExiting) return;
    const timer = setTimeout(() => setDisplayedKey(routeKey), 160);
    return () => clearTimeout(timer);
  }, [isExiting, routeKey]);

  useLayoutEffect(() => {
    cancelSmoothScroll(mainRef.current);
    mainRef.current?.scrollTo(0, 0);
  }, [displayedKey, mainRef]);

  useEffect(() => {
    if (!isExiting && location.pathname === '/explore' && prevExploreSearchRef.current !== location.search) {
      prevExploreSearchRef.current = location.search;
      smoothScrollToTop(mainRef.current);
    } else if (!isExiting) {
      prevExploreSearchRef.current = location.search;
    }
  }, [isExiting, location.pathname, location.search, mainRef]);

  const renderedOutlet = isExiting ? settledRef.current.outlet : currentOutlet;
  const activeLocationContext = isExiting ? settledRef.current.locationContext : liveLocationContext;

  return (
    <div key={displayedKey} className={isExiting ? 'retro-page-exit' : 'retro-page-enter'}>
      <UNSAFE_LocationContext.Provider value={activeLocationContext}>
        {renderedOutlet}
      </UNSAFE_LocationContext.Provider>
    </div>
  );
}

export function AppShell() {
  const preferences = useLibrary((s) => s.preferences);
  const notice = useLibrary((s) => s.notice);
  const setNotice = useLibrary((s) => s.setNotice);
  const main = useRef<HTMLElement>(null);
  const initializeDownloads = useDownloads((s) => s.initialize);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(timer); }, [notice, setNotice]);
  useEffect(() => { const handler = () => setNotice('O armazenamento local está indisponível. As alterações durarão apenas nesta sessão.'); window.addEventListener('storage-unavailable', handler); return () => window.removeEventListener('storage-unavailable', handler); }, [setNotice]);
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void initializeDownloads().then((stop) => { if (disposed) stop(); else unsubscribe = stop; });
    return () => { disposed = true; unsubscribe?.(); };
  }, [initializeDownloads]);
  return <div style={{ ...themeVariables(preferences.theme, preferences.accent), colorScheme: preferences.theme }} className="flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas font-sans text-sm text-ink antialiased selection:bg-accent/30 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-accent [&_[data-console-focused]]:outline-2 [&_[data-console-focused]]:outline-offset-2 [&_[data-console-focused]]:outline-accent">
    <a href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus(); }} className="sr-only z-50 rounded-md bg-accent p-3 text-on-accent focus:not-sr-only focus:absolute">Ir para o conteúdo</a>
    {desktopApi.available && <TitleBar />}<div className="flex min-h-0 flex-1"><Sidebar /><div className="flex min-w-0 flex-1 flex-col"><Header /><main id="main-content" tabIndex={-1} ref={main} className={`min-h-0 flex-1 overflow-y-auto focus:outline-none [scrollbar-color:var(--retro-line)_transparent] ${preferences.density === 'compact' ? 'p-2.5 sm:p-4 lg:p-5' : 'px-3 py-3 sm:p-5 lg:p-6 min-[1600px]:p-8'}`}><div className="mx-auto max-w-[1600px]"><AnimatedOutlet mainRef={main} /></div></main><MobileBottomNav /></div></div>
    <ConsoleNavigation />
    {notice && <div role="status" className="retro-toast fixed bottom-[64px] left-3 right-3 z-50 flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3.5 text-xs shadow-lg md:bottom-4 md:left-auto md:right-4 md:max-w-md md:p-4"><span aria-hidden="true" className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ backgroundImage: 'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)' }} /><span className="retro-pop flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent"><Check size={14} strokeWidth={2.5} /></span><p className="min-w-0 flex-1 break-words">{notice}</p><button aria-label="Fechar aviso" className={iconButton} onClick={() => setNotice(null)}><X size={14} /></button></div>}
  </div>;
}
