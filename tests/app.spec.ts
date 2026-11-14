import { test, expect, type Page } from '@playwright/test';
import { useFixtureCatalogue, fakeHardware, ROWS } from './fixture';

const rowNames = (page: Page) => page.locator('[data-testid=model-row]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.name));
const row = (page: Page, name: string) => page.locator(`[data-testid=model-row][data-name="${name}"]`);
const counter = (page: Page) => page.getByTestId('counter');

test.use({ viewport: { width: 1360, height: 900 } });

test.beforeEach(async ({ page }) => {
  await useFixtureCatalogue(page);
  await fakeHardware(page, { gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)', platform: 'Win32' });
});

test('shows every model, most downloaded first, with official and community counts', async ({ page }) => {
  await page.goto('/');
  await expect(counter(page)).toHaveText('12 of 12');
  await expect(page.getByTestId('scope-all')).toContainText('12');
  await expect(page.getByTestId('scope-official')).toContainText('7');
  await expect(page.getByTestId('scope-community')).toContainText('5');
  expect((await rowNames(page)).slice(0, 3)).toEqual(['llama3.1', 'nomic-embed-text', 'deepseek-r1']);
  await page.getByTestId('scope-community').click();
  expect(await rowNames(page)).toEqual(['carol/translator', 'bob/coder-uncensored', 'bob/huge-70b', 'dave/storyteller', 'eve/coder-copy'].sort((a, b) => 0) && ['bob/coder-uncensored', 'carol/translator', 'bob/huge-70b', 'dave/storyteller', 'eve/coder-copy']);
  await expect(page.getByTestId('model-of-week')).toBeHidden(); // only on the plain front page
});

test('finds your computer on its own, without typing anything', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('device-label')).toHaveText('GeForce RTX 4070');
  await expect(page.getByTestId('device-chip')).toContainText('12 GB');
  // 12 GB card: 7b coder runs well, a 70b-only model is too big, a cloud model is cloud
  await expect(row(page, 'qwen2.5-coder').getByTestId('fit-good')).toBeVisible();
  await expect(row(page, 'bob/huge-70b').getByTestId('fit-no')).toBeVisible();
  await expect(row(page, 'gpt-oss-cloud').getByTestId('fit-cloud')).toBeVisible();
  await expect(row(page, 'nomic-embed-text').getByTestId('fit-unknown')).toBeVisible();
});

test.describe('other computers', () => {
  test('an Apple chip is recognised', async ({ page }) => {
    await fakeHardware(page, { gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)', platform: 'MacIntel' });
    await page.goto('/');
    await expect(page.getByTestId('device-label')).toHaveText('Apple M3 Max');
  });
  test('a computer with no graphics information still gets an answer', async ({ page }) => {
    await fakeHardware(page, { gpu: '', platform: 'Linux', deviceMemory: 4 });
    await page.goto('/');
    await expect(page.getByTestId('device-label')).toHaveText('this computer (4 GB)');
    await expect(row(page, 'tinyllama').getByTestId('fit-good')).toBeVisible();
    await expect(row(page, 'llama3.1').getByTestId('fit-no')).toBeVisible();
  });
});

test('one tap corrects the computer, it is remembered, and automatic detection can come back', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('device-chip').click();
  await page.getByRole('button', { name: '8 GB laptop' }).click();
  await expect(page.getByTestId('device-label')).toHaveText('8 GB laptop');
  await expect(row(page, 'qwen2.5-coder').getByTestId('fit-good')).toBeVisible(); // its 0.5b still fits
  await expect(row(page, 'llama3.1').getByTestId('fit-no')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('device-label')).toHaveText('8 GB laptop');
  await page.getByTestId('device-chip').click();
  await page.getByRole('button', { name: 'Detect again automatically' }).click();
  await expect(page.getByTestId('device-label')).toHaveText('GeForce RTX 4070');
});

test('"only show what runs on it" hides what does not fit', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('fit-only').check();
  const names = await rowNames(page);
  expect(names).not.toContain('bob/huge-70b');
  expect(names).not.toContain('gpt-oss-cloud');
  expect(names).toContain('tinyllama');
  await expect(page).toHaveURL(/fit=1/);
});

test('the search box finds words anywhere in name, description or capability', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search models').fill('uncensored coder');
  expect(await rowNames(page)).toEqual(['bob/coder-uncensored', 'eve/coder-copy']);
  await page.getByLabel('Search models').fill('thinking');
  expect(new Set(await rowNames(page))).toEqual(new Set(['deepseek-r1', 'gpt-oss-cloud']));
});

test('quick picks answer "what do I want to do?"', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('task-coding').click();
  expect(new Set(await rowNames(page))).toEqual(new Set(['qwen2.5-coder', 'bob/coder-uncensored', 'eve/coder-copy']));
  await page.getByTestId('task-coding').click();
  await page.getByTestId('task-vision').click();
  expect(await rowNames(page)).toEqual(['llava']);
  await page.getByTestId('task-vision').click();
  await page.getByTestId('task-small').click();
  const small = await rowNames(page);
  expect(small).toContain('tinyllama');
  expect(small).not.toContain('bob/huge-70b');
  await page.getByTestId('task-small').click();
  await page.getByTestId('task-translation').click();
  expect(await rowNames(page)).toEqual(['carol/translator']);
});

test('settings live in the address, so a view can be shared', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search models').fill('coder');
  await page.getByTestId('scope-community').click();
  await page.getByTestId('sort-select').selectOption('name');
  await expect.poll(() => page.url()).toMatch(/q=coder/);
  const url = new URL(page.url());
  expect(url.searchParams.get('scope')).toBe('community');
  expect(url.searchParams.get('sort')).toBe('name');
  const shared = page.url();

  const other = await page.context().newPage();
  await useFixtureCatalogue(other);
  await other.goto(shared);
  await expect(other.getByLabel('Search models')).toHaveValue('coder');
  await expect(other.getByTestId('scope-community')).toHaveAttribute('aria-selected', 'true');
  expect(await rowNames(other)).toEqual(['bob/coder-uncensored', 'eve/coder-copy']);

  await page.getByLabel('Search models').fill('');
  await page.getByTestId('scope-all').click();
  await page.getByTestId('sort-select').selectOption('auto');
  await expect.poll(() => new URL(page.url()).search).toBe('');
});

test.describe('compare', () => {
  test('pick two to four models and see them side by side', async ({ page }) => {
    await page.goto('/');
    await row(page, 'llama3.1').getByTestId('compare-check').check();
    await expect(page.getByTestId('compare-bar')).toContainText('pick one more');
    await expect(page.getByTestId('open-compare')).toBeDisabled();
    await row(page, 'qwen2.5-coder').getByTestId('compare-check').check();
    await row(page, 'llava').getByTestId('compare-check').check();
    await row(page, 'tinyllama').getByTestId('compare-check').check();
    await expect(page.getByTestId('compare-count')).toHaveText('4');
    await expect(row(page, 'deepseek-r1').getByTestId('compare-check')).toBeDisabled(); // four is the limit
    await expect(page).toHaveURL(/compare=llama3\.1%2Cqwen2\.5-coder%2Cllava%2Ctinyllama/);

    await page.getByTestId('open-compare').click();
    const dialog = page.getByTestId('compare-dialog');
    await expect(dialog.getByTestId('compare-col')).toHaveCount(4);
    await expect(dialog).toContainText('Context window');
    await expect(dialog).toContainText('Downloads');
    await expect(dialog).toContainText('121.0M');
    await expect(dialog.getByTestId('fit-good').first()).toBeVisible();

    await dialog.getByRole('button', { name: 'Remove tinyllama from the comparison' }).click();
    await expect(dialog.getByTestId('compare-col')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByTestId('compare-bar')).toBeHidden();
  });

  test('a shared link brings the comparison back', async ({ page }) => {
    await page.goto('/?compare=llava,tinyllama');
    await expect(page.getByTestId('compare-count')).toHaveText('2');
    await page.getByTestId('open-compare').click();
    await expect(page.getByTestId('compare-col')).toHaveCount(2);
  });
});

test.describe("what's new and trending", () => {
  test("what's new lists models added or updated recently, newest update first", async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('view-new').click();
    expect(await rowNames(page)).toEqual(['gpt-oss-cloud', 'bob/coder-uncensored', 'carol/translator']);
    await expect(row(page, 'gpt-oss-cloud')).toContainText('New');
    await expect(page).toHaveURL(/view=new/);
  });

  test('trending ranks by downloads gained when the list has history', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('view-trending').click();
    await expect(page.getByTestId('trending-note')).toContainText('downloads gained');
    expect((await rowNames(page)).slice(0, 3)).toEqual(['deepseek-r1', 'llama3.1', 'qwen2.5-coder']); // 1,000,000 / 100,000 / 10,000 downloads gained
  });

  test('without history, trending says so and still gives a sensible ranking', async ({ page }) => {
    await page.unroute('**/ollama-catalogue.json');
    await useFixtureCatalogue(page, ROWS, { withGrowth: false });
    await page.goto('/?view=trending');
    await expect(page.getByTestId('trending-note')).toContainText('appears after the next list update');
    const names = await rowNames(page);
    expect(names.length).toBe(12);
    expect(names[0]).toBe('deepseek-r1'); // popular and recently updated beats popular but a year old
  });
});

test.describe('filters', () => {
  test('updated, size, duplicates and publisher', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('open-filters').click();
    const sheet = page.getByTestId('filter-sheet');
    await sheet.getByTestId('upd-30').click();
    await sheet.getByTestId('show-results').click();
    expect(new Set(await rowNames(page))).toEqual(new Set(['gpt-oss-cloud', 'bob/coder-uncensored', 'carol/translator']));

    await page.getByTestId('open-filters').click();
    await sheet.getByTestId('upd-0').click();
    await sheet.getByTestId('max-2').click();
    await sheet.getByTestId('show-results').click();
    expect(new Set(await rowNames(page))).toEqual(new Set(['tinyllama', 'qwen2.5-coder', 'deepseek-r1'])); // a version under 2 GB

    await page.getByTestId('open-filters').click();
    await sheet.getByTestId('max-0').click();
    await sheet.getByTestId('dedupe').click();
    await expect(sheet).toContainText('1 community copies hidden');
    await sheet.getByTestId('show-results').click();
    expect(await rowNames(page)).not.toContain('eve/coder-copy');
    expect(await rowNames(page)).toContain('bob/coder-uncensored');
    await expect(page.getByTestId('active-filters')).toContainText('No near-duplicates');
    await expect(page).toHaveURL(/dedupe=1/);

    await page.getByTestId('active-filters').getByRole('button', { name: 'Clear' }).click();
    await expect(counter(page)).toHaveText('12 of 12');
  });

  test('clicking a publisher shows everything they made', async ({ page }) => {
    await page.goto('/');
    await row(page, 'bob/huge-70b').getByRole('button', { name: 'bob/' }).click();
    expect(new Set(await rowNames(page))).toEqual(new Set(['bob/coder-uncensored', 'bob/huge-70b']));
    await expect(page.getByTestId('active-filters')).toContainText('By bob');
    await expect(page).toHaveURL(/by=bob/);
  });

  test('capability chips and a message when nothing matches', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('capabilities').getByRole('button', { name: 'Vision' }).click();
    expect(await rowNames(page)).toEqual(['llava']);
    await page.getByLabel('Search models').fill('zzzz nothing');
    await expect(page.getByTestId('no-results')).toBeVisible();
    await page.getByRole('button', { name: 'Clear everything' }).click();
    await expect(counter(page)).toHaveText('12 of 12');
  });
});

test('light mode and dark mode, remembered', async ({ page }) => {
  await page.goto('/');
  const pageBg = () => page.locator('.min-h-screen').first().evaluate(el => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => localStorage.setItem('ome.theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/light/);
  const dark = await pageBg();
  expect(dark).toBe('rgb(0, 0, 0)');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await expect.poll(pageBg).toBe('rgb(255, 255, 255)');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/light/);
});

test('live search adds models newer than the saved list', async ({ page }) => {
  await page.route('**/api/proxy?*', route => route.fulfill({
    contentType: 'text/html',
    body: `<ul><li><a href="/brand/new-model-9b" class="group"><h2><span>brand/new-model-9b</span></h2><span class="rounded-md text-indigo-600">tools</span><p>Just released today.</p><span title="1,234 downloads">1.2K</span></a></li><li><a href="/blog">Blog</a></li></ul>`,
  }));
  await page.goto('/');
  await page.getByLabel('Search models').fill('brand new');
  await expect(page.getByTestId('no-results')).toBeVisible();
  await page.getByRole('button', { name: /Search ollama.com live/ }).click();
  await expect(row(page, 'brand/new-model-9b')).toBeVisible();
  await expect(page.getByTestId('live-search')).toContainText('found 1 models');
  await expect(counter(page)).toHaveText('1 of 13');
});

test('the page has no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/');
  await row(page, 'llama3.1').getByTestId('compare-check').check();
  await page.getByTestId('task-coding').click();
  await page.getByTestId('view-new').click();
  await page.getByTestId('view-trending').click();
  await page.getByTestId('open-filters').click();
  await page.getByTestId('show-results').click();
  expect(errors).toEqual([]);
});
