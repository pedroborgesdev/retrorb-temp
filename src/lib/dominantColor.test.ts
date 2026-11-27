import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCoverAccentTheme,
  clearCoverAccentCacheForTests,
  contrastRatio,
  extractCoverAccent,
  extractDominantColorFromPixels,
  hexToRgb,
  peekCoverAccent,
} from './dominantColor';

function makeImageBuffer(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = fill(x, y);
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }
  return buf;
}

describe('extractDominantColorFromPixels', () => {
  it('detecta azul predominante no centro ignorando bordas pretas, brancas e transparentes', () => {
    const pixels = makeImageBuffer(20, 20, (x, y) => {
      if (x < 2 || y < 2) return [0, 0, 0, 0];
      if (x >= 18) return [10, 10, 10, 255];
      if (y >= 18) return [250, 250, 250, 255];
      if (x >= 5 && x <= 14 && y >= 5 && y <= 14) return [40, 120, 235, 255];
      return [120, 120, 120, 255];
    });

    const dominant = extractDominantColorFromPixels(pixels, 20, 20);
    expect(dominant).not.toBeNull();
    expect(dominant!.b).toBeGreaterThan(dominant!.r);
    expect(dominant!.b).toBeGreaterThan(dominant!.g);
  });

  it('retorna null para imagens puramente monocromáticas/cinzas', () => {
    const pixels = makeImageBuffer(10, 10, (x) => (x < 5 ? [20, 20, 20, 255] : [210, 210, 210, 255]));
    expect(extractDominantColorFromPixels(pixels, 10, 10)).toBeNull();
  });

  it('detecta verde quando maioria da capa é verde saturado', () => {
    const pixels = makeImageBuffer(12, 12, () => [36, 185, 92, 255]);
    const dominant = extractDominantColorFromPixels(pixels, 12, 12);
    expect(dominant).toEqual({ r: 36, g: 185, b: 92 });
  });
});

describe('buildCoverAccentTheme', () => {
  it('garante contraste WCAG >= 4.5 entre accent e onAccent nos modos dark e light', () => {
    const samples = [
      { r: 230, g: 60, b: 50 },
      { r: 45, g: 130, b: 245 },
      { r: 245, g: 210, b: 40 },
      { r: 50, g: 195, b: 120 },
    ];

    for (const sample of samples) {
      for (const mode of ['dark', 'light'] as const) {
        const theme = buildCoverAccentTheme(sample, mode);
        const ratio = contrastRatio(hexToRgb(theme.accent), hexToRgb(theme.onAccent));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
        expect(theme.secondary).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('peekCoverAccent e deduplicação em voo', () => {
  beforeEach(() => {
    clearCoverAccentCacheForTests();
  });

  afterEach(() => {
    clearCoverAccentCacheForTests();
    vi.restoreAllMocks();
  });

  it('retorna cache miss para URLs não cacheadas ou inválidas', () => {
    expect(peekCoverAccent(null)).toEqual({ hit: false, color: null });
    expect(peekCoverAccent('javascript:alert(1)')).toEqual({ hit: false, color: null });
    expect(peekCoverAccent('https://example.com/cover.jpg')).toEqual({ hit: false, color: null });
  });

  it('deduplica requisições simultâneas para a mesma capa e não cacheia falha HTTP', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pendingResponse);

    const p1 = extractCoverAccent('https://example.com/green-cover.jpg');
    const p2 = extractCoverAccent('https://example.com/green-cover.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(new Response(null, { status: 404 }));
    await expect(Promise.all([p1, p2])).resolves.toEqual([null, null]);
    expect(peekCoverAccent('https://example.com/green-cover.jpg')).toEqual({ hit: false, color: null });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(extractCoverAccent('https://example.com/green-cover.jpg')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
