import { apiUrl } from '../api/client';
import { brand } from './colors';
import { safeUrl } from './format';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface CoverAccentTheme {
  accent: string;
  onAccent: string;
  secondary: string;
}

const SAMPLE_SIZE = 48;
const HUE_BUCKETS = 24;
const FETCH_TIMEOUT_MS = 2500;
const coverColorCache = new Map<string, RgbColor | null>();
const inFlightRequests = new Map<string, Promise<RgbColor | null>>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === rn) {
    h = (gn - bn) / delta + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / delta + 2;
  } else {
    h = (rn - gn) / delta + 4;
  }
  return { h: h * 60, s, l };
}

export function hslToRgb(h: number, s: number, l: number): RgbColor {
  const hn = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(clamp(l, 0, 1) * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(hn) * 255),
    b: Math.round(hue2rgb(hn - 1 / 3) * 255),
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const hex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace('#', '');
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: RgbColor): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [bright, dark] = la >= lb ? [la, lb] : [lb, la];
  return (bright + 0.05) / (dark + 0.05);
}

/**
 * Extracts the perceptually dominant chromatic color from RGBA pixel data.
 * Ignores transparent, black, white, and near-gray pixels and weights center cover art higher.
 */
export function extractDominantColorFromPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): RgbColor | null {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return null;

  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({
    score: 0,
    weightSum: 0,
    rSum: 0,
    gSum: 0,
    bSum: 0,
  }));

  for (let y = 0; y < height; y++) {
    const ny = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 128) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const { h, s, l } = rgbToHsl(r, g, b);

      if (l < 0.1 || l > 0.92 || s < 0.16) continue;

      const nx = (x + 0.5) / width;
      const inCenter = nx >= 0.15 && nx <= 0.85 && ny >= 0.15 && ny <= 0.85;
      const spatialWeight = inCenter ? 1.25 : 0.7;
      const vibrancyScore = spatialWeight * (0.35 + 1.65 * s) * (1 - Math.abs(l - 0.5) * 0.85);

      const bucketIndex = Math.floor(((h % 360) + 360) % 360 / (360 / HUE_BUCKETS)) % HUE_BUCKETS;
      const bucket = buckets[bucketIndex];
      bucket.score += vibrancyScore;
      bucket.weightSum += spatialWeight;
      bucket.rSum += r * spatialWeight;
      bucket.gSum += g * spatialWeight;
      bucket.bSum += b * spatialWeight;
    }
  }

  let best = buckets[0];
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i].score > best.score) best = buckets[i];
  }

  if (best.weightSum <= 0 || best.score <= 0) return null;

  return {
    r: Math.round(best.rSum / best.weightSum),
    g: Math.round(best.gSum / best.weightSum),
    b: Math.round(best.bSum / best.weightSum),
  };
}

/**
 * Adapts a raw dominant color for dark/light UI surfaces while guaranteeing WCAG AA button text contrast.
 */
export function buildCoverAccentTheme(rgb: RgbColor, mode: 'dark' | 'light'): CoverAccentTheme {
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const darkCandidate = brand.tinta;
  const lightCandidate = brand.papel;
  const darkRgb = hexToRgb(darkCandidate);
  const lightRgb = hexToRgb(lightCandidate);

  const targetS = mode === 'dark' ? clamp(s, 0.48, 0.88) : clamp(s, 0.45, 0.82);
  let targetL = mode === 'dark' ? clamp(l, 0.54, 0.68) : clamp(l, 0.34, 0.46);

  let accentRgb = hslToRgb(h, targetS, targetL);
  let onAccent = contrastRatio(accentRgb, darkRgb) >= contrastRatio(accentRgb, lightRgb)
    ? darkCandidate
    : lightCandidate;
  let onRgb = onAccent === darkCandidate ? darkRgb : lightRgb;

  // Nudge lightness if needed to guarantee >= 4.5:1 contrast for button/badge labels.
  for (let step = 0; step < 6 && contrastRatio(accentRgb, onRgb) < 4.5; step++) {
    targetL = onAccent === darkCandidate ? clamp(targetL + 0.04, 0.4, 0.78) : clamp(targetL - 0.04, 0.24, 0.6);
    accentRgb = hslToRgb(h, targetS, targetL);
  }

  const secondaryRgb = hslToRgb(h + 22, clamp(targetS + 0.05, 0.45, 0.92), clamp(targetL + 0.06, 0.35, 0.75));

  return {
    accent: rgbToHex(accentRgb),
    onAccent,
    secondary: rgbToHex(secondaryRgb),
  };
}

async function decodeImagePixels(blob: Blob): Promise<Uint8ClampedArray | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      ctx.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      return ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    } finally {
      bitmap.close();
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Reads cached dominant cover color synchronously without triggering a network request.
 */
export function peekCoverAccent(
  imageUrl: string | null | undefined,
): { hit: boolean; color: RgbColor | null } {
  const normalized = safeUrl(imageUrl);
  if (!normalized || !coverColorCache.has(normalized)) {
    return { hit: false, color: null };
  }
  return { hit: true, color: coverColorCache.get(normalized) ?? null };
}

function raceWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T | null> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.resolve(null);

  return new Promise<T | null>((resolve, reject) => {
    const onAbort = () => resolve(null);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function fetchAndExtractCoverAccent(normalizedUrl: string): Promise<RgbColor | null> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl('/image', { url: normalizedUrl }), {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
    });
    if (!response.ok) return null;

    const blob = await response.blob();
    const pixels = await decodeImagePixels(blob);
    if (!pixels) return null;

    const dominant = extractDominantColorFromPixels(pixels, SAMPLE_SIZE, SAMPLE_SIZE);
    coverColorCache.set(normalizedUrl, dominant);
    return dominant;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function extractCoverAccent(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<RgbColor | null> {
  const normalized = safeUrl(imageUrl);
  if (!normalized || signal?.aborted) return null;

  if (coverColorCache.has(normalized)) {
    return coverColorCache.get(normalized) ?? null;
  }

  let sharedPromise = inFlightRequests.get(normalized);
  if (!sharedPromise) {
    sharedPromise = fetchAndExtractCoverAccent(normalized).finally(() => {
      inFlightRequests.delete(normalized);
    });
    inFlightRequests.set(normalized, sharedPromise);
  }

  return raceWithSignal(sharedPromise, signal);
}

/**
 * Warms the dominant cover color cache ahead of navigation (e.g. on card hover or focus).
 */
export function prefetchCoverAccent(imageUrl: string | null | undefined): void {
  const normalized = safeUrl(imageUrl);
  if (!normalized || coverColorCache.has(normalized) || inFlightRequests.has(normalized)) {
    return;
  }
  void extractCoverAccent(normalized);
}

export function clearCoverAccentCacheForTests(): void {
  coverColorCache.clear();
  inFlightRequests.clear();
}
