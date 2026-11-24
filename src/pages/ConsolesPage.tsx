import { useState } from 'react';
import { Gamepad2, Search } from 'lucide-react';
import { useConsoles } from '../hooks/useCatalog';
import { ConsoleCard } from '../components/ConsoleCard';
import { EmptyState, ErrorState, SkeletonLoader } from '../components/ui';

// Editorial ordering only; names, mappings and available consoles come from the API.
const popular = ['PlayStation 2', 'PlayStation', 'PlayStation 3', 'PlayStation Portable', 'Game Boy Advance', 'Nintendo DS', 'Nintendo 3DS', 'Nintendo 64', 'Super Nintendo Entertainment System', 'Nintendo GameCube', 'Nintendo Wii', 'Game Boy', 'Game Boy Color', 'Sega Genesis / Mega Drive', 'Sega Dreamcast', 'Xbox', 'Xbox 360'];

export function ConsolesPage() {
  const catalog = useConsoles();
  const [search, setSearch] = useState('');
  const entries = [...(catalog.data?.consoles ?? [])].sort((a, b) => {
    const rank = (name: string) => { const index = popular.indexOf(name); return index < 0 ? popular.length : index; };
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'pt-BR');
  }).filter((entry) => entry.correlative_names.some((name) => name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));

  return <div className="space-y-6">
    <header>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Encontre sua plataforma</p>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Consoles</h1>
      <p className="mt-2 text-sm text-muted">Explore jogos pela plataforma que marcou sua história.</p>
    </header>
    <label className="flex h-[42px] w-full max-w-[420px] items-center gap-3 rounded-lg border border-line bg-surface px-3.5 transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
      <Search size={15} className="shrink-0 text-muted" />
      <input aria-label="Pesquisar consoles" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Encontre um console..." className="min-w-0 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
    </label>
    {catalog.isPending && <SkeletonLoader />}
    {catalog.error && <ErrorState message={catalog.error.message} loading={catalog.isFetching} retry={() => void catalog.refetch()} />}
    {catalog.data && <>
      <p className="text-xs text-muted">{entries.length} consoles disponíveis</p>
      <div className="grid grid-cols-2 gap-3.5 min-[900px]:grid-cols-3 min-[1280px]:grid-cols-4 min-[1600px]:grid-cols-5">
        {entries.map((entry) => <ConsoleCard key={entry.name} console={entry} />)}
      </div>
      {!entries.length && <EmptyState icon={Gamepad2} title="Nenhum console encontrado" description="Tente outro nome ou uma abreviação do console." />}
    </>}
  </div>;
}
