import { describe, expect, it } from 'vitest';
import { frameGeometry, paperProfiles } from './frameGeometry';

const options = { shape: 'paper' as const, cut: 20, irregularity: 8, borderWidth: 5, patternSize: 22 };

describe('frame geometry', () => {
  it('changes the cut layout, not just its scale, between paper profiles', () => {
    const shapes = paperProfiles.map((profile) => frameGeometry({ ...options, profile }).clipPath);
    expect(new Set(shapes).size).toBe(paperProfiles.length);
    expect(new Set(shapes.map((shape) => shape.split(',').length)).size).toBeGreaterThan(1);
  });

  it('keeps a uniform border around rounded corners', () => {
    const geometry = frameGeometry({ ...options, shape: 'rounded', radius: 18 });
    expect(geometry.clipPath).toBe('inset(0 round 18px)');
    expect(geometry.innerClipPath).toBe('inset(0 round 13px)');
  });

  it('bounds invalid geometry inputs without invalid CSS', () => {
    const geometry = frameGeometry({ ...options, shape: 'rounded', radius: NaN, borderWidth: Infinity });
    expect(geometry.clipPath).not.toMatch(/NaN|Infinity/);
    expect(geometry.innerClipPath).not.toMatch(/NaN|Infinity|round -/);
  });

});
