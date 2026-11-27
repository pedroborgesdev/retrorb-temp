import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { FrameColor } from '../lib/colors';
import type { PaperProfile } from '../lib/frameGeometry';

const paletteStyles: Record<FrameColor, { badge: string; lume: string; eyebrow: string }> = {
  teal: {
    badge: 'bg-brand-teal text-brand-ink',
    lume: 'var(--retro-teal)',
    eyebrow: 'text-accent',
  },
  coral: {
    badge: 'bg-brand-coral text-brand-ink',
    lume: 'var(--retro-coral)',
    eyebrow: 'text-brand-coral',
  },
  orange: {
    badge: 'bg-accent text-on-accent',
    lume: 'var(--retro-accent)',
    eyebrow: 'text-accent',
  },
  gold: {
    badge: 'bg-brand-gold text-brand-ink',
    lume: 'var(--retro-gold)',
    eyebrow: 'text-accent',
  },
  blue: {
    badge: 'bg-accent text-on-accent',
    lume: 'var(--retro-accent)',
    eyebrow: 'text-accent',
  },
  green: {
    badge: 'bg-accent text-on-accent',
    lume: 'var(--retro-accent)',
    eyebrow: 'text-accent',
  },
};

export function PageHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
  palette = 'orange',
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  palette?: FrameColor;
  profile?: PaperProfile;
  children?: ReactNode;
}) {
  const tone = paletteStyles[palette];
  return (
    <header
      style={{ '--lume-color': tone.lume } as CSSProperties}
      className="retro-rise retro-lume-rim relative isolate overflow-hidden rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-sm sm:px-5 sm:py-4"
    >
      <div
        aria-hidden="true"
        className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          backgroundImage:
            'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="retro-lume-wash pointer-events-none absolute inset-0 -z-10"
        style={{ '--lume-color': tone.lume } as CSSProperties}
      />
      <div
        aria-hidden="true"
        className="retro-grain pointer-events-none absolute inset-0 -z-10"
      />
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3 sm:gap-3.5">
          <span
            aria-hidden="true"
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm sm:size-10 ${tone.badge}`}
          >
            <Icon size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`font-mono text-[9px] font-semibold uppercase tracking-[0.16em] sm:text-[10px] ${tone.eyebrow}`}>
              {eyebrow}
            </p>
            <h1 className="mt-0.5 break-words font-display text-lg font-semibold leading-tight tracking-tight text-ink sm:text-2xl">
              {title}
            </h1>
            <p className="mt-0.5 text-[11px] leading-4 text-muted sm:text-xs sm:leading-5">
              {description}
            </p>
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}
