import type { ReactNode } from 'react';

export function HorizontalShelf({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  return <div data-console-shelf className={`flex gap-3 overflow-x-auto overscroll-x-contain p-1 pb-3 [scrollbar-color:var(--retro-line)_transparent] ${className}`} role="group" aria-label={label}>
    {children}
  </div>;
}
