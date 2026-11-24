import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/consoles?**', route => route.fulfill({ json: { consoles: ['PlayStation', 'PlayStation 2', 'Nintendo 64', 'Nintendo DS', 'Game Boy', 'Game Boy Advance'].map(name => ({ name, image: null, correlative_names: [name], providers: [] })) } }));
});

test('keyboard moves across a console shelf, keeps focus visible, and preserves text editing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/');
  const shelf = page.getByRole('group', { name: 'Consoles disponíveis' });
  const first = shelf.getByRole('link', { name: 'PlayStation 2', exact: true });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(shelf.getByRole('link', { name: 'Nintendo DS', exact: true })).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  const last = shelf.getByRole('link', { name: 'Game Boy', exact: true });
  await expect(last).toBeFocused();
  expect(await last.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    return rect.left >= parent.left - 1 && rect.right <= parent.right + 1;
  })).toBe(true);
  await page.keyboard.press('Control+k');
  const search = page.getByRole('textbox', { name: 'Pesquisar jogos', exact: true });
  await expect(search).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
});

test('native dialog traps focus and returns it on Escape', async ({ page }) => {
  await page.goto('/#/library');
  const opener = page.getByRole('button', { name: 'Adicionar jogo', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar jogo à biblioteca' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

async function padButton(page: Page, index: number) {
  await page.evaluate(async (index) => {
    const pad = (window as unknown as { testPad: Gamepad }).testPad;
    (pad.buttons[index] as { pressed: boolean }).pressed = true;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    (pad.buttons[index] as { pressed: boolean }).pressed = false;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, index);
}

test('standard gamepad edits a native filter, exits fields and switches tabs; unknown layouts stay inactive', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = { index: 0, id: 'Test controller', connected: true, mapping: '', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
    Object.assign(window, { testPad: pad });
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Aparência', exact: true }).click();
  const theme = page.getByLabel('Tema', { exact: true });
  await theme.focus();
  await padButton(page, 0);
  await expect(page.getByLabel('Comandos do controle')).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as { testPad: { mapping: string } }).testPad.mapping = 'standard'; });
  await padButton(page, 0);
  await expect(page.getByLabel('Comandos do controle')).toContainText('Confirmar');
  await padButton(page, 13);
  await expect(theme).toHaveValue('light');
  await padButton(page, 1);
  await expect(page).toHaveURL(/settings/);
  await expect(page.getByLabel('Comandos do controle')).toContainText('Selecionar');
  await padButton(page, 13);
  await expect(theme).not.toBeFocused();
  await padButton(page, 5);
  await expect(page.getByRole('button', { name: 'Downloads', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await padButton(page, 4);
  await expect(page.getByRole('button', { name: 'Aparência', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(20, 20);
  await expect(page.getByLabel('Comandos do controle')).toHaveCount(0);
});
