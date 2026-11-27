import { describe, expect, it } from 'vitest';
import {
  computeListboxPosition,
  findEdgeEnabledIndex,
  findEnabledIndex,
  findTypeAheadIndex,
  parseSourceFilter,
  serializeSourceFilter,
  type ListboxOption,
} from './listbox';

const sampleOptions: ListboxOption[] = [
  { value: 'all', label: 'Todos' },
  { value: 'ps2', label: 'PlayStation 2', disabled: true },
  { value: 'gba', label: 'Game Boy Advance' },
  { value: 'snes', label: 'Super Nintendo' },
  { value: 'ps1', label: 'PlayStation', disabled: true },
];

describe('listbox navigation helpers', () => {
  it('moves forward and backward skipping disabled options and clamping at bounds', () => {
    expect(findEnabledIndex(sampleOptions, 0, 1)).toBe(2);
    expect(findEnabledIndex(sampleOptions, 2, -1)).toBe(0);
    expect(findEnabledIndex(sampleOptions, 0, -1)).toBe(-1);
    expect(findEnabledIndex(sampleOptions, 3, 1)).toBe(-1);
  });

  it('finds first and last enabled edge options', () => {
    expect(findEdgeEnabledIndex(sampleOptions, 'first')).toBe(0);
    expect(findEdgeEnabledIndex(sampleOptions, 'last')).toBe(3);
    expect(findEdgeEnabledIndex([{ value: 'x', label: 'X', disabled: true }], 'first')).toBe(-1);
  });

  it('matches type-ahead case-insensitively, wraps around, and skips disabled items', () => {
    expect(findTypeAheadIndex(sampleOptions, 'g', 0)).toBe(2);
    expect(findTypeAheadIndex(sampleOptions, 'su', 2)).toBe(3);
    expect(findTypeAheadIndex(sampleOptions, 't', 3)).toBe(0);
    expect(findTypeAheadIndex(sampleOptions, 'play', 0)).toBe(-1);
  });
});

describe('computeListboxPosition', () => {
  it('opens below trigger when viewport space below is sufficient', () => {
    const pos = computeListboxPosition(
      { top: 100, bottom: 140, left: 40, width: 180 },
      { width: 1280, height: 800 },
      4,
    );
    expect(pos.placement).toBe('bottom');
    expect(pos.top).toBe(146);
    expect(pos.left).toBe(40);
    expect(pos.minWidth).toBe(180);
  });

  it('flips above trigger when near bottom of viewport', () => {
    const pos = computeListboxPosition(
      { top: 720, bottom: 760, left: 40, width: 180 },
      { width: 1280, height: 800 },
      6,
    );
    expect(pos.placement).toBe('top');
    expect(pos.top).toBeLessThan(720);
  });

  it('clamps horizontally inside narrow 390px viewports', () => {
    const pos = computeListboxPosition(
      { top: 100, bottom: 140, left: 260, width: 200 },
      { width: 390, height: 850 },
      5,
    );
    expect(pos.maxWidth).toBeLessThanOrEqual(360);
    expect(pos.left + pos.minWidth).toBeLessThanOrEqual(390 - 8);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });
});

describe('source filter serialization', () => {
  const enabled = ['romsfun', 'romspure', 'romsgames', 'wowroms'] as const;

  it('parses empty, none, single, and comma-separated source params in canonical order', () => {
    expect(parseSourceFilter(null, enabled)).toEqual([...enabled]);
    expect(parseSourceFilter('', enabled)).toEqual([...enabled]);
    expect(parseSourceFilter('none', enabled)).toEqual([]);
    expect(parseSourceFilter('romspure', enabled)).toEqual(['romspure']);
    expect(parseSourceFilter('wowroms,romsfun,invalid', ['romsfun', 'romspure', 'wowroms'])).toEqual([
      'romsfun',
      'wowroms',
    ]);
    expect(parseSourceFilter('romsgames', ['romsfun', 'romspure'])).toEqual([]);
  });

  it('serializes all-selected as null, empty as none, and subsets in canonical order', () => {
    expect(serializeSourceFilter(enabled, enabled)).toBeNull();
    expect(serializeSourceFilter([], enabled)).toBe('none');
    expect(serializeSourceFilter(['romspure'], enabled)).toBe('romspure');
    expect(serializeSourceFilter(['wowroms', 'romsfun'], enabled)).toBe('romsfun,wowroms');
    expect(serializeSourceFilter([], [])).toBeNull();
  });
});
