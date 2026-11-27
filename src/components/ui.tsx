import { AlertCircle, Gamepad2, LoaderCircle, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { safeUrl } from '../lib/format';

const buttonBase = 'inline-flex min-h-9 sm:min-h-10 items-center justify-center gap-1.5 sm:gap-2 rounded-[10px] border px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-[13px] font-medium transition-all duration-150 active:scale-[0.97] active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
export const button = `${buttonBase} border-line bg-surface text-ink hover:bg-hover`;
export const primaryButton = `${buttonBase} border-transparent bg-accent text-on-accent hover:bg-accent/85`;
export const iconButton = 'inline-flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-[10px] text-muted transition-all duration-150 hover:bg-hover hover:text-ink active:scale-[0.95] active:bg-line disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
export const input = 'min-h-9 sm:min-h-10 w-full rounded-[10px] border border-line bg-inset px-3 py-2 text-xs sm:text-sm text-ink transition-colors duration-150 placeholder:text-muted hover:border-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40';

export function Artwork({ src, title, className = '', fit = 'cover' }: { src: string | null | undefined; title: string; className?: string; fit?: 'cover' | 'contain' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const url = safeUrl(src);
  return <div className={`flex items-center justify-center overflow-hidden bg-hover ${className}`}>
    {url && !failed ? <img src={url} alt={title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`size-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} /> : <Gamepad2 className="size-9 text-muted/40" strokeWidth={1.25} aria-label="Imagem indisponível" />}
  </div>;
}

export function EmptyState({ icon: Icon = Gamepad2, title, description, children }: { icon?: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return <div className="retro-rise retro-lume-rim relative isolate flex flex-col items-center overflow-hidden rounded-2xl border border-line bg-surface px-4 py-8 text-center shadow-sm sm:rounded-[20px] sm:px-6 sm:py-11">
    <div aria-hidden="true" className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ backgroundImage: 'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)' }} />
    <div aria-hidden="true" className="retro-lume-wash pointer-events-none absolute inset-0 -z-10" />
    <div aria-hidden="true" className="retro-grain pointer-events-none absolute inset-0 -z-10" />
    <div aria-hidden="true" className="mb-3.5 rounded-2xl border border-line bg-inset p-3 text-accent shadow-sm sm:mb-4 sm:p-3.5"><Icon size={24} strokeWidth={1.5} /></div>
    <h2 className="font-display text-base font-medium tracking-tight text-ink sm:text-lg">{title}</h2><p className="mt-1.5 max-w-sm text-xs leading-5 text-muted sm:mt-2 sm:text-sm sm:leading-6">{description}</p>
    {children && <div className="mt-4 sm:mt-5">{children}</div>}
  </div>;
}

export function ErrorState({ message, retry, loading }: { message: string; retry: () => void; loading?: boolean }) {
  return <div role="alert" className="retro-rise flex flex-wrap items-center gap-3 rounded-2xl border border-danger/35 bg-surface p-4 text-sm shadow-sm">
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger"><AlertCircle size={17} /></span><p className="min-w-0 flex-1 break-words text-muted">{message}</p>
    <button className={button} disabled={loading} onClick={retry}>{loading && <LoaderCircle size={13} className="animate-spin" />}Tentar novamente</button>
  </div>;
}

export function LoadingState({ label = 'Carregando…', ariaLabel, compact = false }: { label?: string; ariaLabel?: string; compact?: boolean }) {
  return <div role="status" aria-label={ariaLabel ?? label} className={`retro-rise flex items-center justify-center gap-3 text-xs text-muted ${compact ? 'py-6' : 'py-12'}`}>
    <LoaderCircle size={16} className="shrink-0 animate-spin text-accent" aria-hidden="true" />
    <span>{label}</span>
  </div>;
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef(document.activeElement as HTMLElement | null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (restoreFocus.current?.isConnected) restoreFocus.current.focus(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={onClose} onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex="0"]')].filter(element => !element.matches(':disabled') && element.tabIndex >= 0 && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className={`retro-modal fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-[18px] border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/80 ${wide ? 'max-w-5xl' : 'max-w-lg'}`}>
    <div aria-hidden="true" className="retro-spectrum h-[2px] w-full" style={{ backgroundImage: 'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)' }} />
    <div className="flex items-center justify-between gap-3 border-b border-line bg-inset/50 px-5 py-3.5"><h2 id={titleId} className="font-display text-base font-medium tracking-tight">{title}</h2><button className={iconButton} aria-label="Fechar" onClick={onClose}><X size={17} /></button></div>
    <div className="p-5">{children}</div>
  </dialog>;
}
