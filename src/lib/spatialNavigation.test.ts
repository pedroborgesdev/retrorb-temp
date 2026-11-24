import { describe, expect, it } from 'vitest';
import { spatialTarget } from './spatialNavigation';

const rect = (left: number, top: number, width = 100, height = 100) => ({ left, top, width, height });

describe('spatial focus navigation', () => {
  it('moves along a shelf before crossing rows', () => {
    expect(spatialTarget(rect(0, 0), [rect(110, 0), rect(50, 120)], 'right')).toBe(0);
  });
  it('can leave a shelf for the aligned row below', () => {
    expect(spatialTarget(rect(110, 0), [rect(0, 120), rect(110, 120), rect(220, 0)], 'down')).toBe(1);
  });
  it('does not wrap or move backwards at an edge', () => {
    expect(spatialTarget(rect(0, 0), [rect(110, 0), rect(0, 110)], 'left')).toBe(-1);
    expect(spatialTarget(rect(0, 0), [], 'down')).toBe(-1);
  });
  it('supports reverse directions with unequal controls', () => {
    expect(spatialTarget(rect(110, 110), [rect(110, 0, 80, 40), rect(0, 110, 44, 44)], 'up')).toBe(0);
    expect(spatialTarget(rect(110, 110), [rect(110, 0, 80, 40), rect(0, 110, 44, 44)], 'left')).toBe(1);
  });
});
