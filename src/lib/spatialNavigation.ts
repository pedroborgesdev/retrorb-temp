export type Direction = 'left' | 'right' | 'up' | 'down';
export type FocusRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

/** Prefer the same row/column before crossing into a different shelf. */
export function spatialTarget(origin: FocusRect, candidates: FocusRect[], direction: Direction): number {
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const cx = origin.left + origin.width / 2;
  const cy = origin.top + origin.height / 2;
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((rect, index) => {
    const dx = rect.left + rect.width / 2 - cx;
    const dy = rect.top + rect.height / 2 - cy;
    const distance = (horizontal ? dx : dy) * sign;
    if (distance <= 1) return;
    const cross = Math.abs(horizontal ? dy : dx);
    const overlap = horizontal
      ? rect.top < origin.top + origin.height && rect.top + rect.height > origin.top
      : rect.left < origin.left + origin.width && rect.left + rect.width > origin.left;
    const score = distance + cross * 3 + (overlap ? 0 : 1000);
    if (score < bestScore) { bestScore = score; best = index; }
  });
  return best;
}
