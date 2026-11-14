import { test, expect, type Page } from '@playwright/test';
import { useFixtureCatalogue, fakeHardware } from './fixture';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

const cardNames = (page: Page) => page.locator('[data-testid=model-card]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.name));
const card = (page: Page, name: string) => page.locator(`[data-testid=model-card][data-name="${name}"]`);
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);

test.beforeEach(async ({ page }) => {
  await useFixtureCatalogue(page);
  await fakeHardware(page, { gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)', platform: 'MacIntel' });
});

test('models are cards, not a table, and nothing scrolls sideways', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('model-card')).toHaveCount(12);
  await expect(page.locator('table')).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toBe(true);
  expect((await cardNames(page)).slice(0, 2)).toEqual(['llama3.1', 'nomic-embed-text']);
  await expect(card(page, 'llama3.1')).toContainText('121.0M');
  await expect(card(page, 'llama3.1')).toContainText('8b · 70b · 405b');
  await expect(card(page, 'llama3.1').getByTestId('fit-good')).toBeVisible();
});

test('the first model is visible without scrolling past a wall of controls', async ({ page }) => {
  await page.goto('/');
  const top = await page.getByTestId('model-card').first().evaluate(el => el.getBoundingClientRect().top);
  expect(top).toBeLessThan(560);
});

test('everything you tap is big enough to tap', async ({ page }) => {
  await page.goto('/');
  const targets = [
    page.getByTestId('theme-toggle'),
    page.getByTestId('device-chip'),
    page.getByTestId('view-new'),
    page.getByTestId('scope-official'),
    page.getByTestId('task-coding'),
    page.getByTestId('open-filters'),
    page.getByTestId('sort-select'),
    card(page, 'llama3.1').getByRole('link', { name: /Open llama3.1/ }),
    card(page, 'llama3.1').getByTestId('compare-check'),
  ];
  for (const t of targets) {
    const box = await t.boundingBox();
    expect(box, 'visible').not.toBeNull();
    // a checkbox's tap area is its label, which is larger than the box itself
    const target = (await t.evaluate(el => el.tagName === 'INPUT')) ? await t.locator('xpath=ancestor::label').boundingBox() : box;
    expect(Math.min(target!.width, target!.height), await t.evaluate(el => el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.tagName)).toBeGreaterThanOrEqual(36);
  }
});

test('the computer chip, quick picks and capabilities are one-row scrollers, not walls', async ({ page }) => {
  await page.goto('/');
  for (const id of ['quick-picks', 'capabilities']) {
    const heights = await page.getByTestId(id).evaluate(el => ({ h: el.getBoundingClientRect().height, scrolls: el.scrollWidth > el.clientWidth }));
    expect(heights.h, id).toBeLessThan(60);
    expect(heights.scrolls, `${id} scrolls sideways inside itself`).toBe(true);
  }
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('pick a computer and filter, with the thumb', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('device-label')).toHaveText('Apple M2 Pro');
  await page.getByTestId('device-chip').tap();
  const popup = page.getByRole('dialog', { name: 'Choose your computer' });
  const box = await popup.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await popup.getByRole('button', { name: '8 GB laptop' }).tap();
  await expect(page.getByTestId('device-label')).toHaveText('8 GB laptop');
  await page.getByTestId('fit-only').check();
  await expect(card(page, 'llama3.1')).toHaveCount(0);
  await expect(card(page, 'tinyllama')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('filters open as a bottom sheet that fits the screen', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-filters').tap();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  const box = await sheet.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeCloseTo(844, 0); // sits at the bottom edge
  expect(box!.height).toBeLessThanOrEqual(844 * 0.9);
  await sheet.getByTestId('upd-30').tap();
  await expect(sheet.getByTestId('show-results')).toContainText('Show 3 models');
  await sheet.getByTestId('show-results').tap();
  await expect(page.getByTestId('model-card')).toHaveCount(3);
  await expect(page.getByTestId('open-filters')).toContainText('1');
});

test('compare works on a phone and fills the screen', async ({ page }) => {
  await page.goto('/');
  await card(page, 'llama3.1').getByTestId('compare-check').check();
  await card(page, 'llava').getByTestId('compare-check').check();
  const bar = page.getByTestId('compare-bar');
  await expect(bar).toBeVisible();
  const barBox = await bar.boundingBox();
  expect(barBox!.y + barBox!.height).toBeCloseTo(844, 0);
  await page.getByTestId('open-compare').tap();
  const dialog = page.getByRole('dialog', { name: 'Compare models' });
  const box = await dialog.boundingBox();
  expect([Math.round(box!.width), Math.round(box!.height)]).toEqual([390, 844]);
  await expect(page.getByTestId('compare-col')).toHaveCount(2);
  expect(await noSidewaysScroll(page)).toBe(true); // the table scrolls inside the dialog
  await page.getByRole('button', { name: 'Close comparison' }).tap();
  await expect(dialog).toBeHidden();
});

test('tapping a publisher name shows their models', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('scope-community').tap();
  await card(page, 'bob/huge-70b').getByRole('button', { name: 'bob/' }).tap();
  expect((await cardNames(page)).sort()).toEqual(['bob/coder-uncensored', 'bob/huge-70b']);
});

test('what is new and trending views fit a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('view-new').tap();
  expect(await cardNames(page)).toEqual(['gpt-oss-cloud', 'bob/coder-uncensored', 'carol/translator']);
  await expect(card(page, 'gpt-oss-cloud')).toContainText('New');
  await page.getByTestId('view-trending').tap();
  await expect(page.getByTestId('trending-note')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('light mode is readable on a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('theme-toggle').tap();
  await expect(page.locator('html')).toHaveClass(/light/);
  const colours = await card(page, 'llama3.1').evaluate(el => {
    const bg = getComputedStyle(el).backgroundColor;
    const fg = getComputedStyle(el.querySelector('[data-testid=model-name]')!).color;
    return { bg, fg };
  });
  const lum = (c: string) => { const [r, g, b] = c.match(/\d+/g)!.map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [l1, l2] = [lum(colours.bg), lum(colours.fg)].sort((a, b) => b - a);
  expect((l1 + 0.05) / (l2 + 0.05), 'text contrast').toBeGreaterThan(7);
});

test('scrolling loads more cards', async ({ page }) => {
  const many = Array.from({ length: 400 }, (_, i) => [`user${i}/model-${i}`, `Model number ${i} with a long enough description`, [], 1000 - i, 1, ['7b'], '2025-01-01', '', 0, '']);
  await page.unroute('**/ollama-catalogue.json');
  await useFixtureCatalogue(page, many);
  await page.goto('/');
  await expect(page.getByTestId('model-card')).toHaveCount(150);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByTestId('model-card')).toHaveCount(300);
});
