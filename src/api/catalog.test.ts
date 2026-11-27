import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogApi, isRomCode, type GameStreamStage } from './catalog';

describe('isRomCode', () => {
  it('detecta códigos RO1 válidos mesmo com espaços ao redor', () => {
    expect(isRomCode('RO1-AbCdEfGhIj1234')).toBe(true);
    expect(isRomCode('  RO1-aB_9-xyz123  ')).toBe(true);
  });

  it('rejeita buscas comuns e formatos inválidos', () => {
    expect(isRomCode('pokemon fire red')).toBe(false);
    expect(isRomCode('RO1-short')).toBe(false);
    expect(isRomCode('RO2-AbCdEfGhIj1234')).toBe(false);
    expect(isRomCode('RO1-abc$123456')).toBe(false);
  });
});

describe('catalogApi.gameStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseGame = {
    name: 'Chrono Trigger',
    description: 'RPG clássico',
    release_date: '1995',
    reviews_count: 10,
    stars_rate: 4.9,
    publisher: 'Square',
    regions: ['USA'],
    icon: null,
    screenshots: null,
    downloads: null,
  };

  it('processa eventos SSE progressivos em múltiplos chunks na ordem esperada', async () => {
    const encoder = new TextEncoder();
    const detailsPayload = JSON.stringify({ source: 'romsfun', label: 'RomsFun', game: baseGame });
    const downloadsPayload = JSON.stringify({
      source: 'romsfun',
      label: 'RomsFun',
      game: {
        ...baseGame,
        downloads: [{ filename: 'chrono.zip', type: 'ZIP', size: '4 MB', download_url: null, code: null }],
      },
    });
    const donePayload = JSON.stringify({
      source: 'romsfun',
      label: 'RomsFun',
      game: {
        ...baseGame,
        downloads: [
          {
            filename: 'chrono.zip',
            type: 'ZIP',
            size: '4 MB',
            download_url: 'https://files.romsfun.com/chrono.zip',
            code: 'RO1-AbCdEfGhIj1234',
          },
        ],
      },
    });

    const fullStream =
      `event: details\ndata: ${detailsPayload}\n\n` +
      `event: downloads\ndata: ${downloadsPayload}\n\n` +
      `event: done\ndata: ${donePayload}\n\n`;

    const mid = Math.floor(fullStream.length / 2);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(fullStream.slice(0, mid)));
        controller.enqueue(encoder.encode(fullStream.slice(mid)));
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      }),
    );

    const stages: GameStreamStage[] = [];
    const urlsPerStage: Array<string | null | undefined> = [];
    const finalResp = await catalogApi.gameStream(
      'romsfun',
      'https://romsfun.com/roms/snes/chrono.html',
      (stage, data) => {
        stages.push(stage);
        urlsPerStage.push(data.game.downloads?.[0]?.download_url);
      },
    );

    expect(stages).toEqual(['details', 'downloads', 'done']);
    expect(urlsPerStage).toEqual([undefined, null, 'https://files.romsfun.com/chrono.zip']);
    expect(finalResp.game.downloads?.[0]?.code).toBe('RO1-AbCdEfGhIj1234');
  });

  it('aceita fallback JSON (ex.: mocks de E2E) e dispara evento done', async () => {
    const jsonResp = {
      source: 'romsfun',
      label: 'RomsFun',
      game: {
        ...baseGame,
        downloads: [{ filename: 'chrono.zip', type: 'ZIP', size: '4 MB', download_url: 'https://files.romsfun.com/chrono.zip' }],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(jsonResp), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const stages: GameStreamStage[] = [];
    const result = await catalogApi.gameStream(
      'romsfun',
      'https://romsfun.com/roms/snes/chrono.html',
      (stage) => stages.push(stage),
    );

    expect(stages).toEqual(['done']);
    expect(result.game.name).toBe('Chrono Trigger');
  });
});
