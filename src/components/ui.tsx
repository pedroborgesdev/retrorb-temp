import { AlertCircle, Gamepad2, LoaderCircle, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { safeUrl } from '../lib/format';

const buttonBase = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border px-4 py-2 text-[13px] font-medium transition-colors duration-150 motion-reduce:transition-none active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
export const button = `${buttonBase} border-line bg-surface text-ink hover:bg-hover`;
export const primaryButton = `${buttonBase} border-transparent bg-accent text-on-accent hover:bg-accent/85`;
export const iconButton = 'inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-hover hover:text-ink active:bg-line disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
export const input = 'min-h-10 w-full rounded-[10px] border border-line bg-inset px-3 py-2.5 text-sm text-ink placeholder:text-muted hover:border-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40';
export const select = 'min-h-10 max-w-full min-w-0 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] text-ink hover:border-muted/60 focus:outline-2 focus:outline-accent disabled:opacity-40';

export function Artwork({ src, title, className = '', fit = 'cover' }: { src: string | null | undefined; title: string; className?: string; fit?: 'cover' | 'contain' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const url = safeUrl(src);
  return <div className={`flex items-center justify-center overflow-hidden bg-hover ${className}`}>
    {url && !failed ? <img src={url} alt={title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`size-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} /> : <Gamepad2 className="size-9 text-muted/40" strokeWidth={1.25} aria-label="Imagem indisponível" />}
  </div>;
}

export function EmptyState({ icon: Icon = Gamepad2, title, description, children }: { icon?: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return <div className="flex flex-col items-center rounded-2xl border border-line bg-surface px-5 py-12 text-center">
    <div aria-hidden="true" className="mb-5 rounded-2xl bg-hover p-4 text-muted"><Icon size={28} strokeWidth={1.4} /></div>
    <h2 className="text-lg font-medium text-ink">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>
    {children && <div className="mt-5">{children}</div>}
  </div>;
}

export function ErrorState({ message, retry, loading }: { message: string; retry: () => void; loading?: boolean }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-surface p-4 text-sm">
    <AlertCircle size={16} className="shrink-0 text-danger" /><p className="min-w-0 flex-1 break-words text-muted">{message}</p>
    <button className={button} disabled={loading} onClick={retry}>{loading && <LoaderCircle size={13} className="animate-spin" />}Tentar novamente</button>
  </div>;
}

export function SkeletonLoader({ list = false }: { list?: boolean }) {
  return <div aria-label="Carregando jogos" role="status" className={list ? 'space-y-2' : 'grid grid-cols-2 gap-3.5 min-[900px]:grid-cols-3 xl:grid-cols-5 min-[1600px]:grid-cols-6'}>
    {Array.from({ length: 6 }, (_, i) => <div key={i} className={`motion-safe:animate-pulse rounded-[14px] border border-line bg-surface ${list ? 'h-24' : 'aspect-[3/4]'}`} />)}
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
  }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-[18px] border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/80 ${wide ? 'max-w-5xl' : 'max-w-lg'}`}>
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3"><h2 id={titleId} className="text-base font-medium">{title}</h2><button className={iconButton} aria-label="Fechar" onClick={onClose}><X size={17} /></button></div>
    <div className="p-5">{children}</div>
  </dialog>;
}
