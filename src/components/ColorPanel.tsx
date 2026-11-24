import type { ReactNode } from 'react';

export function ColorPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`relative isolate overflow-hidden rounded-[18px] border border-teal-700/40 bg-brand-teal p-6 text-brand-ink sm:p-8 ${className}`}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12] [background-image:radial-gradient(circle,#083b3a_1.5px,transparent_1.5px)] [background-size:18px_18px]" />
    {children}
  </section>;
}
