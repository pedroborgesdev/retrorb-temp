import { test, expect, type Page } from '@playwright/test';

// Fixtures are confined to tests. The app always uses the real HTTP API.
const labels: Record<string, string> = { romsfun: 'RomsFun', romspure: 'RomsPure', romsgames: 'RomsGames', wowroms: 'WowRoms' };
const domains: Record<string, string> = { romsfun: 'romsfun.com', romspure: 'romspure.cc', romsgames: 'romsgames.net', wowroms: 'wowroms.com' };
const requests: Record<string, number> = {};
function result(source: string, page: number, query = 'Pokemon') {
  return { title: `${query} ${labels[source]} ${page}`, url: `https://${domains[source]}/roms/game-${page}.html`, icon: null, console: 'Game Boy Advance', size: '5 MB', downloads: 1234 };
}
async function mockSearch(page: Page, partialError = false) {
  let failing = partialError;
  await page.route('**/api/search?**', async (route) => {
    const url = new URL(route.request().url()); const source = url.searchParams.get('source')!; const pageNumber = Number(url.searchParams.get('page')); const query = url.searchParams.get('q')!;
    requests[source] = (requests[source] || 0) + 1;
    const error = failing && source === 'romspure';
    await route.fulfill({ json: { query, sources: { [source]: { label: labels[source], results: error ? [] : [result(source, pageNumber, query)], error: error ? 'Fonte temporariamente indisponível.' : null, pagination: { page: pageNumber, has_next: source === 'wowroms' && pageNumber === 1 } } } } });
  });
  return () => { failing = false; };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/consoles?**', (route) => route.fulfill({ json: { consoles: [
    { name: 'Sega Lindbergh', image: 'images/consoles/missing.png', correlative_names: ['Sega Lindbergh'], providers: [] },
    { name: 'PlayStation 3', correlative_names: ['PlayStation 3', 'PS3', 'Sony Playstation 3'], providers: [
      { name: 'romsfun', console_name: 'PS3', consult: { method: 'GET', url: 'https://romsfun.com/browse-all-roms/', params: { 'consoles[]': '15' }, pagination: { mode: 'path', url_template: 'https://romsfun.com/browse-all-roms/page/{page}/' } } },
      { name: 'romspure', console_name: 'Sony Playstation 3', consult: { method: 'GET', url: 'https://romspure.cc/browse-roms/', params: { 'console_opts[]': '3913' }, pagination: { mode: 'path', url_template: 'https://romspure.cc/browse-roms/page/{page}/' } } },
    ] },
  ] } }));
});

test('home console shelf uses catalog artwork and stays horizontally navigable when an image fails', async ({ page }) => {
  await page.unroute('**/api/consoles?**');
  await page.route('**/api/consoles?**', (route) => route.fulfill({ json: { consoles: [
    { name: 'Game Boy Advance', image: 'https://images.example.com/broken.png', correlative_names: ['Game Boy Advance'], providers: [] },
    { name: 'Nintendo DS', image: 'https://images.example.com/ds.svg', correlative_names: ['Nintendo DS'], providers: [] },
    { name: 'PlayStation 2', image: 'https://images.example.com/ps2.svg', correlative_names: ['PlayStation 2'], providers: [] },
    { name: 'Dreamcast', image: 'https://images.example.com/dreamcast.svg', correlative_names: ['Dreamcast'], providers: [] },
  ] } }));
  await page.route('https://images.example.com/*.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="80"><rect width="180" height="80" fill="#fff"/><path d="M20 40h140" stroke="#111" stroke-width="8"/></svg>',
  }));
  await page.route('https://images.example.com/broken.png', (route) => route.abort());

  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/');

  const section = page.getByRole('region', { name: 'Explorar por console' });
  const shelf = page.getByRole('group', { name: 'Consoles disponíveis' });
  await expect(section).toBeVisible();
  await expect(section.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '#/consoles');
  await expect(shelf.getByRole('link', { name: 'PlayStation 2' })).toBeVisible();
  await expect(shelf.getByRole('link', { name: 'Nintendo DS' })).toBeVisible();
  await expect(shelf.getByRole('link', { name: 'Game Boy Advance' }).getByRole('img', { name: 'Game Boy Advance — imagem indisponível' })).toBeVisible();
  await expect(shelf.getByRole('listitem')).toHaveCount(0);
  await expect(shelf.getByRole('link')).toHaveCount(4);
  expect(await page.locator('main').evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const shelfDimensions = await shelf.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(shelfDimensions.scroll).toBeGreaterThan(shelfDimensions.client);
  await shelf.screenshot({ path: 'test-results/home-console-shelf.png' });

  await page.setViewportSize({ width: 1366, height: 850 });
  await expect(shelf.getByRole('link', { name: 'Dreamcast' })).toBeVisible();
  await shelf.screenshot({ path: 'test-results/home-console-shelf-desktop.png' });
});

test('console catalog navigates to empty-text browsing, keeps aliases and paginates', async ({ page }) => {
  const calls: URL[] = [];
  await page.route('**/api/search?**', async (route) => {
    const url = new URL(route.request().url()); calls.push(url);
    const source = url.searchParams.get('source')!;
    const pageNumber = Number(url.searchParams.get('page'));
    const query = url.searchParams.get('q')!;
    await route.fulfill({ json: { query, sources: { [source]: {
      label: labels[source], error: null,
      results: [{ ...result(source, pageNumber, query || 'Console game'), console: source === 'romsfun' ? 'PS3' : 'Sony Playstation 3' }],
      pagination: { page: pageNumber, has_next: pageNumber === 1 },
    } } } });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Ver todos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Consoles', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('PlayStation 3');
  await page.screenshot({ path: 'test-results/consoles.png' });
  await page.getByRole('link', { name: /PlayStation 3/ }).click();
  await expect(page.getByRole('heading', { name: 'Jogos de PlayStation 3' })).toBeVisible();
  await expect(page.getByLabel('Pesquisar jogos', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Filtrar por console')).toHaveValue('PlayStation 3');
  await expect(page.getByText('Console game RomsPure 1', { exact: true })).toBeVisible();
  expect(calls.every((url) => url.searchParams.get('console') === 'PlayStation 3' && url.searchParams.get('q') === '')).toBe(true);
  expect(new Set(calls.map((url) => url.searchParams.get('source')))).toEqual(new Set(['romsfun', 'romspure']));
  await page.getByRole('button', { name: 'Carregar mais de RomsFun' }).click();
  await expect(page.getByText('Console game RomsFun 2', { exact: true })).toBeVisible();
  await page.getByLabel('Pesquisar jogos', { exact: true }).fill('God of War');
  await expect(page.getByText('God of War RomsFun 1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filtrar por console')).toHaveValue('PlayStation 3');
  await page.reload();
  await expect(page.getByLabel('Filtrar por console')).toHaveValue('PlayStation 3');
  await page.getByRole('button', { name: 'Limpar pesquisa' }).click();
  await expect(page.getByText('Console game RomsFun 1', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/console-explore.png' });
  await page.getByRole('link', { name: 'Consoles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Consoles', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sega Lindbergh', exact: true }).getByRole('img', { name: 'Sega Lindbergh — imagem indisponível' })).toBeVisible();
  await page.getByRole('link', { name: 'Explorar', exact: true }).click();
  await page.getByLabel('Filtrar por console').selectOption('PlayStation 3');
  await expect(page.getByText('Console game RomsFun 1', { exact: true })).toBeVisible();
  await page.getByLabel('Filtrar fonte').selectOption('romspure');
  await expect(page.getByLabel('Filtrar por console')).toHaveValue('PlayStation 3');
  await expect(page).toHaveURL(/source=romspure/);
  await expect(page.getByRole('region', { name: 'Resultados RomsFun' })).toHaveCount(0);
  await expect(page.getByText('Console game RomsPure 1', { exact: true })).toBeVisible();
});

test('home, local library, preferences, keyboard shortcut, and responsive shell', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bom ter você por aqui.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/home.png' });
  await page.keyboard.press('Control+k'); await expect(page.getByRole('textbox', { name: 'Pesquisar jogos', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar jogo', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome do jogo' }).fill('Meu jogo local');
  await page.getByRole('textbox', { name: 'Console (opcional)' }).fill('SNES');
  await page.screenshot({ path: 'test-results/local-game-modal.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar jogo', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Meu jogo local', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Configurações', exact: true }).first().click();
  await page.getByRole('button', { name: 'Aparência', exact: true }).click();
  await page.getByLabel('Tema', { exact: true }).selectOption('light');
  await page.reload();
  await page.getByRole('button', { name: 'Aparência', exact: true }).click();
  await expect(page.getByLabel('Tema', { exact: true })).toHaveValue('light');
  for (const width of [1280, 1366, 1920, 2560]) {
    await page.setViewportSize({ width, height: 720 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('link', { name: 'Downloads', exact: true }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('partial failures, source retry and independent pagination preserve other sources', async ({ page }) => {
  for (const key of Object.keys(requests)) delete requests[key];
  const recover = await mockSearch(page, true);
  await page.goto('/#/explore?q=Pokemon');
  const fun = page.getByRole('region', { name: 'Resultados RomsFun' });
  const pure = page.getByRole('region', { name: 'Resultados RomsPure' });
  const wow = page.getByRole('region', { name: 'Resultados WowRoms' });
  await expect(fun.getByText('Pokemon RomsFun 1', { exact: true })).toBeVisible();
  await expect(pure.getByRole('alert')).toContainText('Fonte temporariamente indisponível');
  recover();
  await pure.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(pure.getByText('Pokemon RomsPure 1', { exact: true })).toBeVisible();
  const before = requests.romsfun;
  await wow.getByRole('button', { name: 'Carregar mais de WowRoms' }).click();
  await expect(wow.getByText('Pokemon WowRoms 1', { exact: true })).toBeVisible();
  await expect(wow.getByText('Pokemon WowRoms 2', { exact: true })).toBeVisible();
  expect(requests.romsfun).toBe(before);
  await page.getByRole('button', { name: 'Visualização em lista' }).click();
  await expect(fun.getByText('Pokemon RomsFun 1', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/search.png' });
});

test('details, screenshots, favorites, library and in-place web download', async ({ page }) => {
  await mockSearch(page);
  const longDescription = 'A aventura começa em uma região distante.\nO jogador encontra novos aliados pelo caminho.\nCada cidade guarda histórias próprias.\nOs desafios ficam maiores a cada etapa.\nHá segredos escondidos em diferentes rotas.\nAs batalhas exigem estratégia e atenção.\nNovos recursos são descobertos durante a jornada.\nOs personagens evoluem conforme avançam.\nA exploração revela áreas antes inacessíveis.\nO objetivo final depende das escolhas feitas.\nA jornada termina com um confronto decisivo.';
  await page.route('https://images.example.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"><rect width="500" height="300" fill="#485567"/></svg>' }));
  await page.route('**/api/game?**', (route) => route.fulfill({ json: { source: 'romsfun', label: 'RomsFun', game: {
    name: 'Pokemon RomsFun 1', description: longDescription, release_date: '2004', reviews_count: 0, stars_rate: 4.5, publisher: 'Nintendo', regions: ['USA'], icon: null,
    screenshots: ['https://images.example.com/1.png', 'https://images.example.com/2.png'],
    downloads: [{ filename: 'game.zip', type: 'ZIP', size: '5 MB', download_url: 'https://files.example.com/game.zip' }, { filename: null, type: null, size: null, download_url: null }],
  } } }));
  await page.goto('/#/explore?q=Pokemon');
  await page.getByRole('link', { name: 'Ver Pokemon RomsFun 1 em RomsFun', exact: true }).click();
  const description = page.getByRole('heading', { name: 'Sobre este jogo' }).locator('xpath=..').locator('p');
  const collapsedHeight = (await description.boundingBox())!.height;
  await page.screenshot({ path: 'test-results/game-details-desktop.png', fullPage: true });
  const expandDescription = page.getByRole('button', { name: 'Ver descrição completa' });
  await expect(expandDescription).toHaveAttribute('aria-expanded', 'false');
  await expandDescription.click();
  await expect(page.getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true');
  expect((await description.boundingBox())!.height).toBeGreaterThan(collapsedHeight);
  await page.getByRole('button', { name: 'Mostrar menos' }).click();
  await expect(page.getByRole('button', { name: 'Ver descrição completa' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Indisponível', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Adicionar à biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar aos favoritos', exact: true }).click();
  const main = page.locator('main');
  const scrollBeforeFiles = await main.evaluate((element) => element.scrollTop);
  await page.getByRole('link', { name: 'Ver arquivos', exact: true }).click();
  await expect(page.locator('#game-files')).toBeInViewport();
  expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollBeforeFiles);
  await expect(page).toHaveURL(/#\/game\?source=romsfun/);
  await main.evaluate((element) => element.scrollTo(0, 0));
  const screenshotTrigger = page.getByRole('button', { name: 'Ampliar imagem 1' });
  await screenshotTrigger.click();
  await page.getByRole('button', { name: 'Próxima' }).click();
  await expect(page.getByRole('dialog')).toContainText('Captura 2 de 2');
  await page.screenshot({ path: 'test-results/screenshot-modal.png' });
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(screenshotTrigger).toBeFocused();
  const gameUrl = page.url();
  const browserDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar', exact: true }).click();
  const downloaded = await browserDownload;
  expect(downloaded.suggestedFilename()).toBe('game.zip');
  await expect(page).toHaveURL(gameUrl);
  await expect(page.getByRole('status')).toContainText('Download iniciado no navegador');
  await page.getByRole('link', { name: 'Downloads', exact: true }).first().click();
  await expect(page.getByText('Downloads web ficam no navegador')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nenhum download por aqui' })).toBeVisible();
  await page.getByRole('link', { name: 'Favoritos', exact: true }).click();
  await expect(page.getByText('Pokemon RomsFun 1', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Pokemon RomsFun 1', { exact: true })).toBeVisible();
});

test('desktop download navigates to progress and can be cancelled', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).desktop = {
      windowAction: () => {},
      openExternal: async () => {},
      downloadList: async () => [],
      onDownloadChanged: () => () => {},
      downloadStart: async (request: any) => ({
        ...request, id: 'desktop-download', status: 'downloading', receivedBytes: 2, totalBytes: 10,
        startedAt: '2026-11-23T12:00:00.000Z', completedAt: null, destination: null,
        error: null, platform: 'desktop',
      }),
      downloadCancel: async () => ({
        id: 'desktop-download', source: 'romsfun', gameUrl: 'https://romsfun.com/roms/game-1.html', fileIndex: 0,
        title: 'Pokemon RomsFun 1', icon: null, filename: 'game.zip', size: '5 MB', status: 'cancelled',
        receivedBytes: 2, totalBytes: 10, startedAt: '2026-11-23T12:00:00.000Z', completedAt: '2026-11-23T12:00:01.000Z',
        destination: null, error: null, platform: 'desktop',
      }),
    };
  });
  await page.route('**/api/game?**', (route) => route.fulfill({ json: { source: 'romsfun', label: 'RomsFun', game: {
    name: 'Pokemon RomsFun 1', description: null, release_date: null, reviews_count: null, stars_rate: null,
    publisher: null, regions: null, icon: null, screenshots: null,
    downloads: [{ filename: 'game.zip', type: 'ZIP', size: '5 MB', download_url: 'https://files.example.com/game.zip' }],
  } } }));
  await page.goto('/#/game?source=romsfun&url=https%3A%2F%2Fromsfun.com%2Froms%2Fgame-1.html');

  await page.getByRole('button', { name: 'Baixar', exact: true }).click();

  await expect(page).toHaveURL(/#\/downloads$/);
  await expect(page.getByText('game.zip', { exact: true })).toBeVisible();
  await expect(page.getByText('20%')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByText('Cancelado', { exact: true })).toBeVisible();
});

test('a delayed previous search cannot replace a newer term', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/search?**', async (route) => {
    const url = new URL(route.request().url()); const query = url.searchParams.get('q')!; const source = url.searchParams.get('source')!;
    if (query === 'Old') await gate;
    await route.fulfill({ json: { query, sources: { [source]: { label: labels[source], results: [result(source, 1, query)], error: null, pagination: { page: 1, has_next: false } } } } }).catch(() => {});
  });
  await page.goto('/#/explore?q=Old');
  const input = page.getByRole('textbox', { name: 'Pesquisar jogos', exact: true });
  await input.fill('New');
  await expect(page.getByRole('heading', { name: 'Resultados para “New”' })).toBeVisible();
  await expect(page.getByText('New RomsFun 1', { exact: true })).toBeVisible();
  release();
  await expect(page.getByText('Old RomsFun 1', { exact: true })).toHaveCount(0);
});

test('nullable fields and unavailable images never render null or crash', async ({ page }) => {
  await page.route('**/api/game?**', (route) => route.fulfill({ json: { source: 'romsfun', label: 'RomsFun', game: Object.fromEntries(['name', 'description', 'release_date', 'reviews_count', 'stars_rate', 'publisher', 'regions', 'icon', 'screenshots', 'downloads'].map((key) => [key, null])) } }));
  await page.goto('/#/game?source=romsfun&url=https%3A%2F%2Fromsfun.com%2Froms%2Ftest.html');
  await expect(page.getByRole('heading', { name: 'Título indisponível' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nenhum arquivo disponível' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capturas de tela' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/undefined|NaN|\bnull\b/);
});

test('console redesign stays neutral, unclipped, and responsive across routes and themes', async ({ page }) => {
  await mockSearch(page);
  await page.route('**/api/game?**', (route) => route.fulfill({ json: { source: 'romsfun', label: 'RomsFun', game: {
    name: 'Um clássico com um título comprido para testar os cards', description: 'Uma aventura de teste.',
    release_date: '2004', reviews_count: 12, stars_rate: 4.5, publisher: 'Nintendo', regions: ['USA'], icon: null, screenshots: [],
    downloads: [{ filename: 'um-arquivo-com-nome-comprido.zip', type: 'ZIP', size: '5 MB', download_url: null }],
  } } }));
  const paths = ['/', '/consoles', '/explore?q=Pokemon', '/library', '/favorites', '/downloads', '/settings', '/game?source=romsfun&url=https%3A%2F%2Fromsfun.com%2Froms%2Ftest.html'];
  for (const theme of ['dark', 'light']) {
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Aparência', exact: true }).click();
    await page.getByLabel('Tema', { exact: true }).selectOption(theme);
    for (const width of [390, 768, 1366]) {
      await page.setViewportSize({ width, height: 850 });
      for (const path of paths) {
        await page.goto(`/#${path}`);
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.locator('main [data-paper-frame]')).toHaveCount(0);
        const clipped = await page.locator('main, main *:not(.sr-only)').evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).clipPath !== 'none').map((element) => element.tagName));
        expect(clipped, `${theme} ${width} ${path}: clipped main content`).toEqual([]);
        const consoleCards = page.locator('main a').filter({ has: page.locator('h2') }).filter({ has: page.locator('[role="img"]') });
        if (path === '/') await expect(consoleCards).toHaveCount(2);
        if (path === '/consoles') await expect(consoleCards).toHaveCount(2);
        const gameCards = page.locator('main article');
        if (path.startsWith('/explore?')) {
          await expect(gameCards).toHaveCount(4);
          if (theme === 'dark') await expect(gameCards.first()).toHaveCSS('background-color', 'rgb(38, 40, 43)');
        }
        if (theme === 'dark') {
          const background = await page.locator('main').evaluate((element) => getComputedStyle(element).getPropertyValue('--retro-canvas').trim());
          expect(background).toBe('#1B1C1E');
          if (path === '/' || path === '/consoles') await expect(consoleCards.first()).toHaveCSS('background-color', 'rgb(38, 40, 43)');
        }
        const main = page.locator('main');
        expect(await main.evaluate((element) => element.scrollWidth - element.clientWidth), `${theme} ${width} ${path}: content overflow`).toBeLessThanOrEqual(1);
        const search = await page.getByRole('textbox', { name: 'Pesquisar jogos', exact: true }).boundingBox();
        expect(search!.width, `${theme} ${width} ${path}: search width`).toBeGreaterThan(120);
        expect(search!.x + search!.width).toBeLessThanOrEqual(width);
      }
    }
  }
});
