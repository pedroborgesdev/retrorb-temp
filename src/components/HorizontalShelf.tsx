import type { ReactNode } from 'react';

export function HorizontalShelf({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  return <div data-console-shelf className={`flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain p-0.5 pb-2 sm:gap-3.5 sm:p-1 sm:pb-3 [scrollbar-color:var(--retro-line)_transparent] ${className}`} role="group" aria-label={label}>
    {children}
  </div>;
}
