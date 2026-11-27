import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelSmoothScroll,
  computeScrollDuration,
  computeTargetScrollTop,
  easeOutCubic,
  smoothScrollToPosition,
} from './scroll';

describe('scroll animation engine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clamps easeOutCubic and decelerates cleanly', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(1.5)).toBe(1);
  });

  it('clamps computed scroll duration between 240ms and 520ms', () => {
    expect(computeScrollDuration(50)).toBe(240);
    expect(computeScrollDuration(-50)).toBe(240);
    expect(computeScrollDuration(900)).toBe(378);
    expect(computeScrollDuration(3000)).toBe(520);
  });

  it('computes and clamps target scrollTop relative to the scroll container', () => {
    expect(
      computeTargetScrollTop({
        currentScrollTop: 100,
        containerTop: 64,
        targetTop: 564,
        maxScrollTop: 1000,
        offset: 16,
      }),
    ).toBe(584);

    expect(
      computeTargetScrollTop({
        currentScrollTop: 10,
        containerTop: 64,
        targetTop: 40,
        maxScrollTop: 500,
        offset: 12,
      }),
    ).toBe(0);

    expect(
      computeTargetScrollTop({
        currentScrollTop: 400,
        containerTop: 64,
        targetTop: 900,
        maxScrollTop: 600,
        offset: 12,
      }),
    ).toBe(600);
  });

  it('animates scrollTop over rAF frames and stops when cancelled', () => {
    let now = 1000;
    const queue: Array<(ts: number) => void> = [];
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
      queue.push(cb);
      return queue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const container = {
      scrollTop: 0,
      scrollHeight: 2000,
      clientHeight: 500,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;

    smoothScrollToPosition(container, 400, 300);
    expect(queue).toHaveLength(1);

    now = 1150;
    queue.shift()!(1150);
    expect(container.scrollTop).toBeGreaterThan(200);
    expect(container.scrollTop).toBeLessThan(400);
    expect(queue).toHaveLength(1);

    cancelSmoothScroll(container);
    now = 1300;
    queue.shift()!(1300);
    expect(container.scrollTop).toBeLessThan(400);
    expect(queue).toHaveLength(0);
  });
});
