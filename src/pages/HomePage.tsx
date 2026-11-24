import { ArrowRight, ArrowUpRight, BookOpen, Compass, Gamepad2, Heart, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../store/useLibrary';
import { button } from '../components/ui';
import { GameCollection } from '../components/GameCollection';
import { useConsoles } from '../hooks/useCatalog';
import { ColorPanel } from '../components/ColorPanel';
import { ConsoleCard } from '../components/ConsoleCard';
import { HorizontalShelf } from '../components/HorizontalShelf';
import { SectionHeader } from '../components/SectionHeader';

const shelfLink = 'inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent';
const featuredConsoleNames = ['PlayStation 2', 'Nintendo DS', 'Game Boy Advance'];

export function HomePage() {
  const consoleCatalog = useConsoles();
  const entries = useLibrary((s) => s.entries);
  const recents = useLibrary((s) => s.recents);
  const library = entries.filter((entry) => entry.inLibrary).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const favorites = entries.filter((entry) => entry.favorite);
  const consoles = consoleCatalog.data?.consoles ?? [];
  const preferredConsoles = featuredConsoleNames.flatMap(name => {
    const entry = consoles.find(consoleEntry => consoleEntry.name === name);
    return entry ? [entry] : [];
  });
  const featuredConsoles = [...preferredConsoles, ...consoles.filter(entry => !preferredConsoles.includes(entry))].slice(0, 6);

  return <div className="space-y-8">
    <header>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Seu ponto de partida</p>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Bom ter você por aqui.</h1>
      <p className="mt-1 text-xs text-muted">Os jogos mudam. Algumas aventuras ficam com a gente.</p>
    </header>

    <ColorPanel className="min-h-[230px]">
      <div className="flex min-h-[174px] items-center justify-between gap-6">
        <div className="max-w-xl">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em]">Sua próxima aventura</p>
          <h2 className="max-w-md text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Dê play nas suas melhores memórias.</h2>
          <p className="mt-3 text-sm">Encontre seus clássicos e organize sua coleção.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/explore" className="inline-flex items-center gap-2 rounded-lg bg-brand-ink px-3.5 py-2.5 text-xs font-semibold text-paper transition-colors hover:bg-brand-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"><Compass size={14} />Explorar jogos<ArrowRight size={14} /></Link>
            <Link to="/library" className="inline-flex items-center gap-2 rounded-lg border border-brand-ink/30 bg-white/20 px-3.5 py-2.5 text-xs font-semibold text-brand-ink transition-colors hover:bg-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"><BookOpen size={14} />Minha biblioteca</Link>
          </div>
        </div>
        <div aria-hidden="true" className="mr-4 hidden size-36 shrink-0 items-center justify-center rounded-full border border-brand-ink/20 bg-white/10 sm:flex lg:mr-10 lg:size-44">
          <Gamepad2 className="size-24 lg:size-28" strokeWidth={1.15} />
        </div>
      </div>
    </ColorPanel>

    <section aria-label="Explorar por console">
      <SectionHeader title="Explorar por console" action={<Link to="/consoles" className={shelfLink}>Ver todos<ArrowRight size={14} /></Link>} />
      {consoles.length > 0 ?
      <HorizontalShelf label="Consoles disponíveis">
        {featuredConsoles.map((entry) => <ConsoleCard key={entry.name} console={entry} shelf />)}
      </HorizontalShelf> : <Link to="/consoles" className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5 text-sm text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"><span>Busque jogos por console</span><ArrowRight size={16} /></Link>}
    </section>

    {library.length > 0 && <section>
      <SectionHeader title="Descubra jogos" action={<Link to="/explore" className={shelfLink}>Explorar todos<ArrowRight size={14} /></Link>} />
      <GameCollection items={library.slice(0, 6)} />
    </section>}

    {recents.length > 0 && <section>
      <SectionHeader title="Continue explorando" />
      <div className="flex flex-wrap gap-2">{recents.map((query) => <Link key={query} to={`/explore?q=${encodeURIComponent(query)}`} className={button}><Search size={13} className="text-muted" />{query}<ArrowUpRight size={13} className="text-muted" /></Link>)}</div>
    </section>}

    <section className="grid gap-3 sm:grid-cols-2">
      <Link to="/library" className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-hover text-muted"><BookOpen size={19} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Biblioteca</span><span className="mt-1 block text-xs text-muted">Seus jogos salvos em um só lugar</span></span><ArrowRight size={16} className="text-muted transition-colors group-hover:text-accent" />
      </Link>
      <Link to="/favorites" className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-hover text-muted"><Heart size={19} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Favoritos</span><span className="mt-1 block text-xs text-muted">Os clássicos que você destacou</span></span><ArrowRight size={16} className="text-muted transition-colors group-hover:text-accent" />
      </Link>
    </section>

    {favorites.length > 0 && <section><SectionHeader title="Seus favoritos" /><GameCollection items={favorites.slice(0, 6)} /></section>}
    <p className="pb-1 text-[10px] text-muted/60">Seus clássicos, em um só lugar. Use apenas conteúdo que você tem autorização para acessar.</p>
  </div>;
}
