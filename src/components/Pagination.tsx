import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { buildPageTokens } from '../lib/pagination';

interface PaginationProps {
  label: string;
  page: number;
  totalLoadedPages: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (nextPage: number) => void;
}

export function Pagination({
  label,
  page,
  totalLoadedPages,
  hasMore,
  isLoadingMore,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
}: PaginationProps) {
  if (totalLoadedPages <= 1 && !hasMore && page <= 1) return null;

  const visibleTotal = Math.max(totalLoadedPages, page);
  const tokens = buildPageTokens(page, visibleTotal);
  const canGoPrev = page > 1;
  const canGoNext = page < totalLoadedPages || hasMore;

  return (
    <nav
      aria-label={label}
      className="retro-rise flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-line bg-inset/60 px-3 py-2 sm:px-4 sm:py-2.5"
    >
      <div className="flex items-center gap-2 text-[11px] text-muted">
        {totalItems > 0 && endIndex > startIndex ? (
          <span className="tabular-nums">
            <strong className="font-mono font-semibold text-ink">{startIndex + 1}–{endIndex}</strong> de{' '}
            <strong className="font-mono font-semibold text-ink">{totalItems}{hasMore ? '+' : ''}</strong>
          </span>
        ) : (
          <span>Página <span className="font-mono tabular-nums">{page}</span></span>
        )}
        <span
          aria-hidden={!isLoadingMore}
          className={`inline-flex items-center gap-1.5 text-accent transition-opacity duration-200 ${
            isLoadingMore ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
          <span className="hidden sm:inline">Pré-carregando…</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={!canGoPrev}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-line bg-surface px-2.5 text-xs font-medium text-ink transition-all duration-150 hover:border-muted/60 hover:bg-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:px-3"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Anterior</span>
        </button>

        <div className="flex items-center gap-1">
          {tokens.map((token, index) =>
            token === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="retro-page-chip-in px-1 text-xs text-muted select-none">
                …
              </span>
            ) : (
              <button
                key={token}
                type="button"
                aria-label={`Página ${token}`}
                aria-current={token === page ? 'page' : undefined}
                onClick={() => onPageChange(token)}
                className={`retro-page-chip-in inline-flex h-8 min-w-8 items-center justify-center rounded-[10px] border px-2 font-mono text-xs font-medium tabular-nums transition-all duration-200 active:scale-95 sm:h-9 sm:min-w-9 ${
                  token === page
                    ? 'border-accent/50 bg-accent/15 font-semibold text-accent shadow-xs'
                    : 'border-line bg-surface text-muted hover:border-muted/60 hover:bg-hover hover:text-ink'
                }`}
              >
                {token}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          aria-label="Próxima página"
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-line bg-surface px-2.5 text-xs font-medium text-ink transition-all duration-150 hover:border-muted/60 hover:bg-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:px-3"
        >
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
