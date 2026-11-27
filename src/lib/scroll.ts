export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

export function computeScrollDuration(distance: number): number {
  return Math.round(Math.min(520, Math.max(240, Math.abs(distance) * 0.42)));
}

export function computeTargetScrollTop({
  currentScrollTop,
  containerTop,
  targetTop,
  maxScrollTop,
  offset = 12,
}: {
  currentScrollTop: number;
  containerTop: number;
  targetTop: number;
  maxScrollTop: number;
  offset?: number;
}): number {
  const raw = currentScrollTop + (targetTop - containerTop) - offset;
  return Math.min(Math.max(0, maxScrollTop), Math.max(0, raw));
}

const activeScrolls = new WeakMap<HTMLElement, () => void>();

export function cancelSmoothScroll(container: HTMLElement | null | undefined): void {
  if (!container) return;
  activeScrolls.get(container)?.();
}

export function smoothScrollToPosition(
  container: HTMLElement | null | undefined,
  targetTop: number,
  duration?: number,
): void {
  if (!container) return;
  cancelSmoothScroll(container);

  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const clampedTarget = Math.min(maxScrollTop, Math.max(0, targetTop));
  const startTop = container.scrollTop;
  const delta = clampedTarget - startTop;

  if (Math.abs(delta) < 1) {
    container.scrollTop = clampedTarget;
    return;
  }

  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;
  if (typeof raf !== 'function') {
    container.scrollTop = clampedTarget;
    return;
  }

  const totalDuration = Math.max(1, duration ?? computeScrollDuration(delta));
  const nowFn = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const startTime = nowFn();
  let frameId = 0;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (frameId && typeof caf === 'function') caf(frameId);
    container.removeEventListener?.('wheel', cleanup);
    container.removeEventListener?.('touchstart', cleanup);
    container.removeEventListener?.('pointerdown', cleanup);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
    }
    if (activeScrolls.get(container) === cleanup) {
      activeScrolls.delete(container);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      cleanup();
    }
  };

  activeScrolls.set(container, cleanup);
  container.addEventListener?.('wheel', cleanup, { passive: true, once: true });
  container.addEventListener?.('touchstart', cleanup, { passive: true, once: true });
  container.addEventListener?.('pointerdown', cleanup, { passive: true, once: true });
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown, { passive: true });
  }

  const step = (timestamp: number) => {
    if (cleaned) return;
    const elapsed = Math.max(0, timestamp - startTime);
    const progress = Math.min(1, elapsed / totalDuration);
    container.scrollTop = startTop + delta * easeOutCubic(progress);
    if (progress < 1) {
      frameId = raf(step);
    } else {
      cleanup();
    }
  };

  frameId = raf(step);
}

export function findScrollContainer(element: HTMLElement): HTMLElement | null {
  const main = element.closest?.<HTMLElement>('#main-content');
  if (main) return main;

  let current: HTMLElement | null = element.parentElement;
  while (current) {
    const overflowY = getComputedStyle(current).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

export function smoothScrollToElement(
  target: HTMLElement | null | undefined,
  options?: { offset?: number; duration?: number },
): void {
  if (!target) return;
  const container = findScrollContainer(target);
  if (!container) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const nextTop = computeTargetScrollTop({
    currentScrollTop: container.scrollTop,
    containerTop: container.getBoundingClientRect().top,
    targetTop: target.getBoundingClientRect().top,
    maxScrollTop: container.scrollHeight - container.clientHeight,
    offset: options?.offset ?? 12,
  });
  smoothScrollToPosition(container, nextTop, options?.duration);
}

export function smoothScrollToTop(container: HTMLElement | null | undefined, duration?: number): void {
  smoothScrollToPosition(container, 0, duration);
}
