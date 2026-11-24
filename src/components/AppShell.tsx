import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, Compass, Gamepad2, Heart, Home, PanelLeftClose, PanelLeftOpen, Maximize2, Minus, Search, Settings2, X } from 'lucide-react';
import { desktopApi } from '../api/desktop';
import { useLibrary } from '../store/useLibrary';
import { iconButton } from './ui';
import { AppLogo } from './AppLogo';
import { themeVariables } from '../lib/colors';
import { ConsoleNavigation } from './ConsoleNavigation';
import { useDownloads } from '../store/useDownloads';

function TitleBar() {
  return <div className="flex h-9 shrink-0 select-none items-center justify-between border-b border-line bg-sidebar text-muted">
    <div className={`flex h-full flex-1 items-center px-5 ${desktopApi.available ? '[-webkit-app-region:drag]' : ''}`}><AppLogo variant="retrorb" className="size-5" decorative /></div>
    {desktopApi.available ? <div className="flex h-full [-webkit-app-region:no-drag]">
      <button onClick={() => desktopApi.windowAction('minimize')} aria-label="Minimizar" className="px-4 hover:bg-hover"><Minus size={13} /></button>
      <button onClick={() => desktopApi.windowAction('maximize')} aria-label="Maximizar ou restaurar" className="px-4 hover:bg-hover"><Maximize2 size={11} /></button>
      <button onClick={() => desktopApi.windowAction('close')} aria-label="Fechar janela" className="px-4 hover:bg-brand-coral hover:text-brand-ink"><X size={14} /></button>
    </div> : <span className="px-5 text-[10px]">Edição web</span>}
  </div>;
}

function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const libraryCount = useLibrary((s) => s.entries.filter((e) => e.inLibrary).length);
  const main = [
    { to: '/', label: 'Início', icon: Home }, { to: '/explore', label: 'Explorar', icon: Compass },
    { to: '/consoles', label: 'Consoles', icon: Gamepad2 },
    { to: '/library', label: 'Biblioteca', icon: BookOpen }, { to: '/favorites', label: 'Favoritos', icon: Heart },
    { to: '/downloads', label: 'Downloads', icon: ArrowDownToLine },
  ];
  const labelClass = expanded ? 'hidden min-[1280px]:block' : 'hidden';
  return <aside aria-label="Menu principal" className={`flex w-[72px] shrink-0 flex-col overflow-y-auto border-r border-line bg-sidebar ${expanded ? 'min-[1280px]:w-[220px]' : ''}`}>
    <Link to="/" aria-label="RetroOrb — Início" className="flex h-20 shrink-0 items-center justify-center px-4 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent">
      <AppLogo variant="retrorb" className={`size-10 ${expanded ? 'min-[1280px]:hidden' : ''}`} decorative />
      {expanded && <AppLogo variant="retrorb-extended" className="hidden h-12 w-full min-[1280px]:block" decorative />}
    </Link>
    <nav aria-label="Navegação principal" className="space-y-1.5 px-3">{main.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} title={label} aria-label={label} className={({ isActive }) => `flex h-12 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent ${isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-hover hover:text-ink'}`}><Icon size={20} className="shrink-0" /><span className={`flex-1 ${labelClass}`}>{label}</span>{to === '/library' && libraryCount > 0 && <span className={`text-xs tabular-nums ${labelClass}`}>{libraryCount}</span>}</NavLink>)}</nav>
    <div className="mt-auto space-y-2 px-3 py-4">
      <button data-console-menu aria-label={expanded ? 'Recolher navegação' : 'Expandir navegação'} title={expanded ? 'Recolher navegação' : 'Expandir navegação'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="hidden h-11 w-full items-center gap-3 rounded-xl px-3 text-xs text-muted hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent min-[1280px]:flex">{expanded ? <PanelLeftClose size={20} className="shrink-0" /> : <PanelLeftOpen size={20} className="shrink-0" />}<span className={labelClass}>Recolher menu</span></button>
      <NavLink to="/settings" title="Configurações" aria-label="Configurações" className={({ isActive }) => `flex h-12 items-center gap-3 rounded-xl px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-accent ${isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-hover'}`}><Settings2 size={20} className="shrink-0" /><span className={labelClass}>Configurações</span></NavLink>
    </div>
  </aside>;
}

function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQuery = params.get('q') || '';
  const [value, setValue] = useState(urlQuery);
  const field = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selected = params.get('source');
  const addRecent = useLibrary((s) => s.addRecent);
  useEffect(() => { setValue(urlQuery); clearTimeout(timer.current); }, [urlQuery, location.pathname, location.search]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); field.current?.focus(); field.current?.select(); }
      if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1); }
      if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); navigate(1); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  function submit(query: string, replace: boolean) {
    clearTimeout(timer.current);
    const q = query.trim();
    if (q) addRecent(q);
    navigate(`/explore?${new URLSearchParams({ ...(q ? { q } : {}), ...(selected ? { source: selected } : {}), ...(params.get('console') ? { console: params.get('console')! } : {}) })}`, { replace });
  }
  return <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-canvas px-3 sm:gap-4 sm:px-5 lg:px-8">
    <div className="flex shrink-0 gap-1"><button title="Voltar (Alt+←)" aria-label="Voltar" className={iconButton} onClick={() => navigate(-1)}><ArrowLeft size={17} /></button><span className="hidden sm:block"><button title="Avançar" aria-label="Avançar" className={iconButton} onClick={() => navigate(1)}><ArrowRight size={17} /></button></span></div>
    <form role="search" className="relative mx-auto min-w-0 flex-1 sm:max-w-[500px]" onSubmit={(event) => { event.preventDefault(); submit(value, false); }}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input ref={field} aria-label="Pesquisar jogos" maxLength={200} value={value} onChange={(event) => {
        const next = event.target.value; setValue(next); clearTimeout(timer.current);
        timer.current = setTimeout(() => submit(next, location.pathname === '/explore'), 450);
      }} placeholder="Encontre seu próximo clássico..." className="h-10 w-full rounded-[10px] border border-line bg-inset pl-10 pr-8 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:pr-16" />
      {value ? <button type="button" aria-label="Limpar pesquisa" onClick={() => { setValue(''); submit('', true); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><X size={14} /></button> : <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-sans text-[9px] text-muted sm:block">Ctrl K</kbd>}
    </form>
    <div className="ml-auto hidden items-center gap-2 sm:flex"><Link to="/downloads" aria-label="Downloads" title="Downloads" className={iconButton}><ArrowDownToLine size={17} /></Link><div className="mx-1 h-5 w-px bg-line" /><Link to="/settings" aria-label="Configurações" className={iconButton}><Settings2 size={17} /></Link></div>
  </header>;
}

export function AppShell() {
  const preferences = useLibrary((s) => s.preferences);
  const notice = useLibrary((s) => s.notice);
  const setNotice = useLibrary((s) => s.setNotice);
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const initializeDownloads = useDownloads((s) => s.initialize);
  useEffect(() => { main.current?.scrollTo(0, 0); }, [location.pathname, location.search]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(timer); }, [notice, setNotice]);
  useEffect(() => { const handler = () => setNotice('O armazenamento local está indisponível. As alterações durarão apenas nesta sessão.'); window.addEventListener('storage-unavailable', handler); return () => window.removeEventListener('storage-unavailable', handler); }, [setNotice]);
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void initializeDownloads().then((stop) => { if (disposed) stop(); else unsubscribe = stop; });
    return () => { disposed = true; unsubscribe?.(); };
  }, [initializeDownloads]);
  return <div style={{ ...themeVariables(preferences.theme, preferences.accent), colorScheme: preferences.theme }} className="flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas font-sans text-sm text-ink antialiased selection:bg-accent/30 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-accent [&_[data-console-focused]]:outline-2 [&_[data-console-focused]]:outline-offset-2 [&_[data-console-focused]]:outline-accent motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none">
    <a href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus(); }} className="sr-only z-50 rounded-md bg-accent p-3 text-on-accent focus:not-sr-only focus:absolute">Ir para o conteúdo</a>
    {desktopApi.available && <TitleBar />}<div className="flex min-h-0 flex-1"><Sidebar /><div className="flex min-w-0 flex-1 flex-col"><Header /><main id="main-content" tabIndex={-1} ref={main} className={`min-h-0 flex-1 overflow-y-auto focus:outline-none [scrollbar-color:var(--retro-line)_transparent] ${preferences.density === 'compact' ? 'p-3 sm:p-4 lg:p-5' : 'p-4 sm:p-6 lg:p-8 min-[1600px]:p-10'}`}><div className="mx-auto max-w-[1600px]"><Outlet /></div></main></div></div>
    <ConsoleNavigation />
    {notice && <div role="status" className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-line bg-surface p-4 text-xs shadow-lg sm:max-w-md"><Check size={16} className="shrink-0 text-accent" /><p className="min-w-0 break-words">{notice}</p><button aria-label="Fechar aviso" className={iconButton} onClick={() => setNotice(null)}><X size={14} /></button></div>}
  </div>;
}
