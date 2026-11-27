import { useState } from 'react';
import { Gamepad2, Search, X } from 'lucide-react';
import { useConsoles } from '../hooks/useCatalog';
import { ConsoleCard, type ConsoleCardAccent } from '../components/ConsoleCard';
import { button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { PageHeading } from '../components/PageHeading';

// Editorial ordering only; names, mappings and available consoles come from the API.
const popular = ['PlayStation 2', 'PlayStation', 'PlayStation 3', 'PlayStation Portable', 'Game Boy Advance', 'Nintendo DS', 'Nintendo 3DS', 'Nintendo 64', 'Super Nintendo Entertainment System', 'Nintendo GameCube', 'Nintendo Wii', 'Game Boy', 'Game Boy Color', 'Sega Genesis / Mega Drive', 'Sega Dreamcast', 'Xbox', 'Xbox 360'];
const consoleAccents: ConsoleCardAccent[] = ['orange', 'coral', 'gold'];

const brandFilters = [
  { id: 'all', label: 'Todos', pattern: null },
  { id: 'playstation', label: 'PlayStation', pattern: /playstation|\bps[1-5]?\b|psp|ps\s?vita/i },
  { id: 'nintendo', label: 'Nintendo', pattern: /nintendo|game\s?boy|famicom|\bwii\b|\bnes\b|\bsnes\b|gamecube|\bnds\b|\b3ds\b|\bgba\b/i },
  { id: 'sega', label: 'Sega', pattern: /sega|mega\s?drive|genesis|dreamcast|saturn|master\s?system|game\s?gear/i },
  { id: 'xbox', label: 'Xbox', pattern: /xbox/i },
  { id: 'atari', label: 'Atari', pattern: /atari/i },
] as const;

export function ConsolesPage() {
  const catalog = useConsoles();
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState<(typeof brandFilters)[number]['id']>('all');
  const activePattern = brandFilters.find((item) => item.id === brand)?.pattern ?? null;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const hasImage = (entry: { image?: string | null }) => Boolean(entry.image?.trim());
  const entries = [...(catalog.data?.consoles ?? [])].sort((a, b) => {
    const rank = (name: string) => { const index = popular.indexOf(name); return index < 0 ? popular.length : index; };
    return rank(a.name) - rank(b.name) || Number(hasImage(b)) - Number(hasImage(a)) || a.name.localeCompare(b.name, 'pt-BR');
  }).filter((entry) => {
    const matchesSearch = !normalizedSearch || entry.correlative_names.some((name) => name.toLocaleLowerCase().includes(normalizedSearch));
    const matchesBrand = !activePattern || activePattern.test(entry.name) || entry.correlative_names.some((name) => activePattern.test(name));
    return matchesSearch && matchesBrand;
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading
        eyebrow="Encontre sua plataforma"
        title="Consoles"
        description="Explore jogos pela plataforma que marcou sua história."
        icon={Gamepad2}
        palette="orange"
      >
        {catalog.data && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-inset px-2.5 py-1 text-[10px] font-medium text-muted sm:px-3 sm:py-1.5 sm:text-[11px]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-orange" />
            <strong className="font-semibold tabular-nums text-ink">{entries.length}</strong> consoles
          </span>
        )}
      </PageHeading>

      <div className="retro-rise flex flex-col gap-2.5 rounded-2xl border border-line bg-inset/60 p-2.5 sm:flex-row sm:items-center sm:justify-between sm:p-3" style={{ '--stagger': 1 } as import('react').CSSProperties}>
        <label className="flex h-9 w-full items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 transition-colors duration-150 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent sm:max-w-[320px]">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            aria-label="Pesquisar consoles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Encontre um console..."
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted sm:text-sm"
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca de consoles"
              onClick={() => setSearch('')}
              className="rounded-md p-1 text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </label>
        <div role="group" aria-label="Filtrar por fabricante" className="flex gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
          {brandFilters.map((item) => {
            const active = brand === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setBrand(item.id)}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${active ? 'border-brand-orange/40 bg-brand-orange/15 text-ink shadow-xs' : 'border-line bg-surface text-muted hover:bg-hover hover:text-ink'}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {catalog.isPending && <LoadingState label="Carregando consoles…" />}
      {catalog.error && <ErrorState message={catalog.error.message} loading={catalog.isFetching} retry={() => void catalog.refetch()} />}
      {catalog.data && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4 xl:grid-cols-5 min-[1600px]:grid-cols-6">
            {entries.map((entry, index) => (
              <ConsoleCard
                key={entry.name}
                console={entry}
                accent={consoleAccents[index % consoleAccents.length]}
                stagger={index}
              />
            ))}
          </div>
          {!entries.length && (
            <EmptyState
              icon={Gamepad2}
              title="Nenhum console encontrado"
              description="Tente outro nome, abreviação ou remova o filtro de fabricante."
            >
              {(search || brand !== 'all') && (
                <button type="button" className={button} onClick={() => { setSearch(''); setBrand('all'); }}>
                  Limpar filtros
                </button>
              )}
            </EmptyState>
          )}
        </>
      )}
    </div>
  );
}
