import type { CSSProperties } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Compass, Gamepad2, Heart, LayoutGrid, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../store/useLibrary';
import { button, LoadingState } from '../components/ui';
import { GameCollection } from '../components/GameCollection';
import { useConsoles } from '../hooks/useCatalog';
import { AppLogo } from '../components/AppLogo';
import { ColorPanel } from '../components/ColorPanel';
import { ConsoleCard, type ConsoleCardAccent } from '../components/ConsoleCard';
import { HorizontalShelf } from '../components/HorizontalShelf';
import { SectionHeader } from '../components/SectionHeader';

const shelfLink = 'inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent';
const featuredConsoleNames = [
  'PlayStation 2',
  'Nintendo DS',
  'Game Boy Advance',
  'Super Nintendo Entertainment System',
  'PlayStation',
  'Nintendo 64',
  'PlayStation Portable',
  'Sega Genesis / Mega Drive',
];
const consoleAccents: ConsoleCardAccent[] = ['orange', 'coral', 'gold'];

export function HomePage() {
  const consoleCatalog = useConsoles();
  const entries = useLibrary((s) => s.entries);
  const recents = useLibrary((s) => s.recents);
  const enabledSources = useLibrary((s) => s.preferences.enabledSources);
  const library = entries.filter((entry) => entry.inLibrary).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const favorites = entries.filter((entry) => entry.favorite);
  const consoles = consoleCatalog.data?.consoles ?? [];
  const preferredConsoles = featuredConsoleNames.flatMap((name) => {
    const entry = consoles.find((consoleEntry) => consoleEntry.name === name);
    return entry ? [entry] : [];
  });
  const featuredConsoles = [...preferredConsoles, ...consoles.filter((entry) => !preferredConsoles.includes(entry))].slice(0, 8);

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2.5 sm:gap-4">
        <div className="min-w-0">
          <p className="mb-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-accent sm:mb-1 sm:text-[10px]">Seu ponto de partida</p>
          <h1 className="font-display text-lg font-semibold tracking-tight text-ink sm:text-2xl">Bom ter você por aqui.</h1>
          <p className="mt-0.5 hidden text-xs text-muted sm:block">Os jogos mudam. Algumas aventuras ficam com a gente.</p>
        </div>
        <div
          aria-label="Resumo do console"
          className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[10px] text-muted sm:gap-2 sm:px-3 sm:py-2 sm:text-[11px]"
        >
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent sm:size-2" />
            <strong className="font-mono font-semibold tabular-nums text-ink">{consoles.length}</strong> consoles
          </span>
          <span aria-hidden="true" className="text-line">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-orange sm:size-2" />
            <strong className="font-mono font-semibold tabular-nums text-ink">{library.length}</strong> <span className="hidden sm:inline">na biblioteca</span><span className="sm:hidden">salvos</span>
          </span>
          <span aria-hidden="true" className="text-line">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-coral sm:size-2" />
            <strong className="font-mono font-semibold tabular-nums text-ink">{favorites.length}</strong> fav
          </span>
          <span aria-hidden="true" className="hidden text-line sm:inline">·</span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <span aria-hidden="true" className="size-2 rounded-full bg-brand-petrol" />
            <strong className="font-mono font-semibold tabular-nums text-ink">{enabledSources.length}</strong> fontes
          </span>
        </div>
      </header>

      <ColorPanel className="min-h-0 sm:min-h-[180px]">
        <div className="flex min-h-0 items-center justify-between gap-5 sm:min-h-[144px] lg:gap-8">
          <div className="max-w-xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-paper/85 sm:mb-3 sm:px-3 sm:py-1 sm:text-[10px]">
              <span aria-hidden="true" className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-brand-orange sm:size-2" />
                <span className="size-1.5 rounded-full bg-brand-coral sm:size-2" />
                <span className="size-1.5 rounded-full bg-brand-gold sm:size-2" />
              </span>
              RetroOrb · Sua próxima aventura
            </div>
            <h2 className="max-w-lg font-display text-lg font-semibold leading-tight tracking-tight text-paper sm:text-2xl lg:text-[30px]">
              Dê play nas suas melhores memórias.
            </h2>
            <p className="mt-1.5 max-w-md text-xs leading-5 text-paper/75 sm:mt-2.5 sm:text-sm sm:leading-6">
              Encontre seus clássicos, navegue por plataforma e organize sua coleção em um só lugar.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2 sm:mt-5">
              <Link
                to="/explore"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent shadow-md transition-all duration-150 hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-10 sm:gap-2 sm:px-4 sm:py-2"
              >
                <Compass size={14} />Explorar jogos<ArrowRight size={14} />
              </Link>
              <Link
                to="/consoles"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-paper transition-all duration-150 hover:bg-white/15 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper sm:min-h-10 sm:gap-2 sm:px-4 sm:py-2"
              >
                <Gamepad2 size={14} />Explorar consoles
              </Link>
              <Link
                to="/library"
                className="hidden min-h-10 items-center gap-2 rounded-[10px] border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-paper transition-all duration-150 hover:bg-white/15 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper sm:inline-flex"
              >
                <BookOpen size={14} />Minha biblioteca
              </Link>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="hidden shrink-0 items-center justify-center sm:flex lg:mr-4"
          >
            <div className="retro-float relative">
              <AppLogo
                variant="retrorb"
                size={512}
                decorative
                className="size-36 drop-shadow-[0_6px_12px_rgba(0,0,0,0.22)] md:size-44 lg:size-52 xl:size-56"
              />
            </div>
          </div>
        </div>
      </ColorPanel>

      <section aria-label="Explorar por console" className="retro-rise rounded-2xl border border-line bg-inset/60 p-3 sm:rounded-[20px] sm:p-4" style={{ '--stagger': 1 } as CSSProperties}>
        <SectionHeader
          title="Explorar por console"
          description="Escolha sua plataforma favorita para navegar direto pelo catálogo."
          action={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] font-medium text-muted sm:px-3 sm:text-[11px]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              <strong className="font-mono font-semibold tabular-nums text-ink">{consoles.length}</strong> <span className="hidden sm:inline">plataformas</span>
            </span>
          }
        />
        {consoles.length > 0 ? (
          <HorizontalShelf label="Consoles disponíveis">
            {featuredConsoles.map((entry, index) => (
              <ConsoleCard
                key={entry.name}
                console={entry}
                accent={consoleAccents[index % consoleAccents.length]}
                stagger={index}
                shelf
              />
            ))}
            <Link
              to="/consoles"
              aria-label="Ver todos"
              style={{ '--stagger': featuredConsoles.length } as CSSProperties}
              className="retro-rise retro-sheen retro-lume-rim group relative isolate flex h-[132px] min-w-[124px] flex-1 shrink-0 snap-start flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-line bg-surface p-3 text-center text-ink transition-all duration-200 ease-out hover:border-accent/65 hover:bg-hover hover:shadow-xl active:scale-[0.98] hover:-translate-y-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:scale-[1.02] sm:h-[168px] sm:min-w-[154px] sm:gap-3 sm:p-4"
            >
              <span
                aria-hidden="true"
                className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-80 transition-opacity group-hover:opacity-100"
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
              <span className="flex size-9 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-ink transition-transform duration-200 ease-out group-hover:scale-110 sm:size-11 sm:rounded-2xl">
                <LayoutGrid size={18} />
              </span>
              <span className="space-y-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink sm:text-xs">
                  Ver todos
                  <ArrowRight size={13} className="text-muted transition-all duration-150 group-hover:translate-x-1 group-hover:text-accent" />
                </span>
                <span className="block text-[10px] text-muted sm:text-[11px]">{consoles.length} consoles</span>
              </span>
            </Link>
          </HorizontalShelf>
        ) : consoleCatalog.isPending ? (
          <LoadingState compact label="Carregando plataformas…" />
        ) : (
          <Link
            to="/consoles"
            className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent sm:p-5 sm:text-sm"
          >
            <span>Busque jogos por console</span>
            <ArrowRight size={16} />
          </Link>
        )}
      </section>

      {recents.length > 0 && (
        <section>
          <SectionHeader title="Continue explorando" />
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {recents.map((query) => (
              <Link key={query} to={`/explore?q=${encodeURIComponent(query)}`} className={`${button} min-h-8 px-2.5 py-1 text-xs`}>
                <Search size={12} className="text-muted" />
                {query}
                <ArrowUpRight size={12} className="text-muted" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Acesso rápido" className="grid grid-cols-3 gap-2 sm:gap-3">
        <Link
          to="/library"
          aria-label="Abrir biblioteca"
          style={{ '--stagger': 2 } as CSSProperties}
          className="retro-rise retro-sheen group flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-line bg-surface p-2.5 text-center transition-all duration-200 ease-out hover:border-accent/60 hover:bg-hover hover:shadow-lg active:scale-[0.98] hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:gap-3.5 sm:p-3.5 sm:text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent shadow-sm transition-transform duration-200 group-hover:scale-105 sm:size-10">
            <BookOpen size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-center gap-1.5 text-xs font-medium sm:justify-start sm:text-sm">
              Biblioteca
              <span className="rounded-md border border-accent/35 bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink">
                {library.length}
              </span>
            </span>
            <span className="mt-0.5 hidden text-xs text-muted sm:block">Seus jogos salvos em um só lugar</span>
          </span>
          <ArrowRight size={15} className="hidden text-muted transition-all duration-150 group-hover:translate-x-1 group-hover:text-accent sm:block" />
        </Link>

        <Link
          to="/favorites"
          aria-label="Abrir favoritos"
          style={{ '--stagger': 3 } as CSSProperties}
          className="retro-rise retro-sheen group flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-line bg-surface p-2.5 text-center transition-all duration-200 ease-out hover:border-brand-coral/60 hover:bg-hover hover:shadow-lg active:scale-[0.98] hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:gap-3.5 sm:p-3.5 sm:text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-coral text-brand-ink shadow-sm transition-transform duration-200 group-hover:scale-105 sm:size-10">
            <Heart size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-center gap-1.5 text-xs font-medium sm:justify-start sm:text-sm">
              Favoritos
              <span className="rounded-md border border-brand-coral/35 bg-brand-coral/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink">
                {favorites.length}
              </span>
            </span>
            <span className="mt-0.5 hidden text-xs text-muted sm:block">Os clássicos que você destacou</span>
          </span>
          <ArrowRight size={15} className="hidden text-muted transition-all duration-150 group-hover:translate-x-1 group-hover:text-brand-coral sm:block" />
        </Link>

        <Link
          to="/downloads"
          aria-label="Abrir downloads"
          style={{ '--stagger': 4 } as CSSProperties}
          className="retro-rise retro-sheen group flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-line bg-surface p-2.5 text-center transition-all duration-200 ease-out hover:border-brand-orange/60 hover:bg-hover hover:shadow-lg active:scale-[0.98] hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:gap-3.5 sm:p-3.5 sm:text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-orange text-brand-ink shadow-sm transition-transform duration-200 group-hover:scale-105 sm:size-10">
            <ArrowDownToLine size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium sm:text-sm">Downloads</span>
            <span className="mt-0.5 hidden text-xs text-muted sm:block">Acompanhe seus arquivos</span>
          </span>
          <ArrowRight size={15} className="hidden text-muted transition-all duration-150 group-hover:translate-x-1 group-hover:text-brand-orange sm:block" />
        </Link>
      </section>

      {library.length > 0 && (
        <section>
          <SectionHeader
            title="Adicionados recentemente"
            action={<Link to="/library" className={shelfLink}>Ver biblioteca<ArrowRight size={14} /></Link>}
          />
          <GameCollection items={library.slice(0, 6)} />
        </section>
      )}

      {favorites.length > 0 && (
        <section>
          <SectionHeader title="Seus favoritos" action={<Link to="/favorites" className={shelfLink}>Ver todos<ArrowRight size={14} /></Link>} />
          <GameCollection items={favorites.slice(0, 6)} />
        </section>
      )}

      <p className="pb-1 text-[10px] text-muted/60">
        Seus clássicos, em um só lugar. Use apenas conteúdo que você tem autorização para acessar.
      </p>
    </div>
  );
}
