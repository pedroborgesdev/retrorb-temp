import { useState, type CSSProperties } from 'react';
import { ArrowUpRight, Gamepad2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ConsoleEntry } from '../types/contracts';

export type ConsoleCardAccent = 'teal' | 'orange' | 'coral' | 'gold' | 'petrol';

const accentStyles: Record<
  ConsoleCardAccent,
  { border: string; bar: string; arrow: string; lume: string }
> = {
  teal: {
    border: 'hover:border-brand-teal/65',
    bar: 'bg-brand-teal',
    arrow: 'group-hover:text-brand-teal',
    lume: 'var(--retro-teal)',
  },
  orange: {
    border: 'hover:border-brand-orange/65',
    bar: 'bg-brand-orange',
    arrow: 'group-hover:text-brand-orange',
    lume: 'var(--retro-orange)',
  },
  coral: {
    border: 'hover:border-brand-coral/65',
    bar: 'bg-brand-coral',
    arrow: 'group-hover:text-brand-coral',
    lume: 'var(--retro-coral)',
  },
  gold: {
    border: 'hover:border-brand-gold/65',
    bar: 'bg-brand-gold',
    arrow: 'group-hover:text-brand-gold',
    lume: 'var(--retro-gold)',
  },
  petrol: {
    border: 'hover:border-brand-petrol/65',
    bar: 'bg-brand-petrol',
    arrow: 'group-hover:text-brand-teal',
    lume: 'var(--retro-petrol)',
  },
};

export function ConsoleCard({
  console: entry,
  shelf = false,
  accent = 'orange',
  stagger,
}: {
  console: ConsoleEntry;
  shelf?: boolean;
  accent?: ConsoleCardAccent;
  stagger?: number;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const image = entry.image?.trim();
  const route = `/explore?${new URLSearchParams({ console: entry.name })}`;
  const tone = accentStyles[accent];

  return (
    <Link
      to={route}
      aria-label={entry.name}
      style={{
        ...(stagger !== undefined ? { '--stagger': stagger } : {}),
        '--lume-color': tone.lume,
      } as CSSProperties}
      className={`${stagger !== undefined ? 'retro-rise ' : ''}retro-sheen retro-lume-rim group relative isolate flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink transition-all duration-250 ease-out ${tone.border} hover:shadow-xl active:scale-[0.98] hover:-translate-y-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:scale-[1.02] ${
        shelf
          ? 'h-[132px] min-w-[124px] flex-1 shrink-0 snap-start sm:h-[168px] sm:min-w-[154px]'
          : 'h-[138px] sm:h-[178px]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] opacity-55 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 ${tone.bar}`}
      />
      <span
        aria-hidden="true"
        className="retro-lume-wash pointer-events-none absolute inset-0 -z-10 opacity-55 transition-opacity duration-200 group-hover:opacity-100"
        style={{ '--lume-color': tone.lume } as CSSProperties}
      />
      <span
        aria-hidden="true"
        className="retro-grain pointer-events-none absolute inset-0 -z-10"
      />
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2.5 sm:p-4">
        {image && failedImage !== image ? (
          <img
            src={image}
            alt={entry.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(image)}
            className="relative max-h-full max-w-full object-contain transition-transform duration-200 ease-out group-hover:scale-110"
          />
        ) : (
          <span role="img" aria-label={`${entry.name} — imagem indisponível`} className="relative">
            <Gamepad2 aria-hidden size={40} strokeWidth={1.1} className="text-muted/55 transition-transform duration-200 group-hover:scale-110 sm:size-12" />
          </span>
        )}
      </div>
      <div className="flex min-h-10 items-center justify-between gap-2 border-t border-line/80 bg-inset/50 px-2.5 py-1.5 sm:min-h-11 sm:px-3.5 sm:py-2">
        <h2 className="line-clamp-2 min-w-0 font-display text-[11px] font-semibold leading-3.5 tracking-tight text-ink sm:text-xs sm:leading-4">{entry.name}</h2>
        <ArrowUpRight
          aria-hidden
          size={13}
          className={`shrink-0 text-muted transition-all duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${tone.arrow}`}
        />
      </div>
    </Link>
  );
}
