import type { CSSProperties, ReactNode } from 'react';

export function ColorPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      style={{ '--lume-color': 'var(--retro-accent)' } as CSSProperties}
      className={`retro-rise retro-lume-rim relative isolate overflow-hidden rounded-2xl border border-white/10 bg-brand-surface p-4 text-paper shadow-2xl sm:rounded-[22px] sm:p-6 lg:p-7 ${className}`}
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
        style={{ '--lume-color': 'var(--retro-accent)' } as CSSProperties}
      />
      <div
        aria-hidden="true"
        className="retro-grain pointer-events-none absolute inset-0 -z-10"
      />
      {children}
    </section>
  );
}
