import { test, expect, type Page } from '@playwright/test';
import { useFixtureCatalogue, fakeHardware, ROWS, tagsHtml } from './fixture';

const rowNames = (page: Page) => page.locator('[data-testid=model-row]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.name));
const row = (page: Page, name: string) => page.locator(`[data-testid=model-row][data-name="${name}"]`);
const counter = (page: Page) => page.getByTestId('counter');

/** Tick or untick one choice in the always-visible filter panel. */
async function choose(page: Page, group: 'tasks' | 'caps', value: string) {
  await page.getByTestId(`${group}-${value}`).click();
}

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
  await expect(page.getByTestId('device-bar')).toContainText('12 GB');
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
  await choose(page, 'tasks', 'coding');
  expect(new Set(await rowNames(page))).toEqual(new Set(['qwen2.5-coder', 'bob/coder-uncensored', 'eve/coder-copy']));
  await choose(page, 'tasks', 'coding');
  await choose(page, 'tasks', 'vision');
  expect(await rowNames(page)).toEqual(['llava']);
  await choose(page, 'tasks', 'vision');
  await choose(page, 'tasks', 'small');
  const small = await rowNames(page);
  expect(small).toContain('tinyllama');
  expect(small).not.toContain('bob/huge-70b');
  await choose(page, 'tasks', 'small');
  await choose(page, 'tasks', 'translation');
  expect(await rowNames(page)).toEqual(['carol/translator']);
});

test('quick picks can be combined: a model must match all of them', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tasks-coding').click();
  await page.getByTestId('tasks-small').click();
  // coding AND small: only qwen2.5-coder has a version of 4b or less; the 7b community coders are not small
  expect(await rowNames(page)).toEqual(['qwen2.5-coder']);
  await page.getByTestId('tasks-translation').click(); // coding AND small AND translation: nothing is all three
  await expect(page.getByTestId('no-results')).toBeVisible();
  await page.getByTestId('tasks-translation').click();
  await expect(page).toHaveURL(/task=coding%2Csmall/);
  // chips show each choice, and each can be removed on its own
  await page.getByRole('button', { name: 'Remove filter Coding' }).click();
  await expect(page).toHaveURL(/task=small(&|$)/);
  await expect(page.getByTestId('active-filters')).not.toContainText('Coding');
});

test('capabilities can be combined too', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('caps-tools').click();
  await page.getByTestId('caps-thinking').click();
  expect(await rowNames(page)).toEqual(['deepseek-r1']); // tools AND thinking
  await page.getByTestId('caps-thinking').click();
  expect((await rowNames(page)).length).toBeGreaterThan(1);
  await page.getByTestId('caps-tools').click();
  await expect(page.getByTestId('active-filters')).not.toContainText('Tools');
});

test('a shared link with several picks opens with them applied', async ({ page }) => {
  await page.goto('/?task=coding,small&cap=tools');
  await expect(page.getByTestId('active-filters')).toContainText('Coding');
  await expect(page.getByTestId('active-filters')).toContainText('Small & fast');
  await expect(page.getByTestId('active-filters')).toContainText('Tools');
  expect(await rowNames(page)).toEqual(['qwen2.5-coder']);
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
  await expect(other.getByTestId('scope-community')).toHaveAttribute('aria-checked', 'true');
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
    const sheet = page.getByTestId('filter-panel');
    await sheet.getByTestId('upd-30').click();
    expect(new Set(await rowNames(page))).toEqual(new Set(['gpt-oss-cloud', 'bob/coder-uncensored', 'carol/translator']));

    await sheet.getByTestId('upd-0').click();
    await sheet.getByTestId('max-2').click();
    expect(new Set(await rowNames(page))).toEqual(new Set(['tinyllama', 'qwen2.5-coder', 'deepseek-r1'])); // a version under 2 GB

    await sheet.getByTestId('max-0').click();
    await sheet.getByTestId('dedupe').click();
    expect(await rowNames(page)).not.toContain('eve/coder-copy');
    expect(await rowNames(page)).toContain('bob/coder-uncensored');
    await expect(page.getByTestId('active-filters')).toContainText('No near-duplicates');
    await expect(page).toHaveURL(/dedupe=1/);

    await page.getByRole('button', { name: 'Clear all filters' }).click();
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
    await choose(page, 'caps', 'vision');
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
  await choose(page, 'tasks', 'coding');
  await page.getByTestId('view-new').click();
  await page.getByTestId('view-trending').click();
  expect(errors).toEqual([]);
});

const speedOf = async (page: Page, name: string) => {
  const text = await row(page, name).getByTestId('speed').innerText();
  return Number(/~(\d+(?:\.\d+)?)/.exec(text)![1]);
};

test.describe('speed', () => {
  test('shows tokens per second for what fits, worked out from the memory speed', async ({ page }) => {
    await page.goto('/');
    // RTX 4070: 504 GB/s. qwen2.5-coder: the 14b (8.4 GB) is the biggest that fits, so 0.65 x 504 / 8.4 = about 39
    expect(await speedOf(page, 'qwen2.5-coder')).toBeGreaterThanOrEqual(37);
    expect(await speedOf(page, 'qwen2.5-coder')).toBeLessThanOrEqual(41);
    // tinyllama (1.1b, under 1 GB) is far faster
    expect(await speedOf(page, 'tinyllama')).toBeGreaterThan(300);
    // nothing to say for what does not fit, is a cloud model, or has no size
    await expect(row(page, 'bob/huge-70b').getByTestId('speed-none')).toBeVisible();
    await expect(row(page, 'gpt-oss-cloud').getByTestId('speed-none')).toBeVisible();
    await expect(row(page, 'nomic-embed-text').getByTestId('speed-none')).toBeVisible();
    await expect(row(page, 'tinyllama').getByTestId('speed')).toHaveAttribute('data-tier', 'fast');
  });

  test('a slower computer gets slower numbers', async ({ page }) => {
    await page.goto('/');
    const fast = await speedOf(page, 'qwen2.5-coder');
    await page.getByTestId('device-chip').click();
    await page.getByRole('button', { name: '16 GB laptop' }).click(); // 50 GB/s
    const slow = await speedOf(page, 'qwen2.5-coder');
    expect(slow).toBeLessThan(fast / 4);
    await expect(row(page, 'qwen2.5-coder').getByTestId('speed')).toHaveAttribute('data-tier', /ok|slow|good/);
  });

  test('sort by the fastest on your computer, and keep only the fast ones', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('sort-select').selectOption('speed');
    const names = await rowNames(page);
    expect(names[0]).toBe('tinyllama');
    expect(names.slice(-3)).toContain('bob/huge-70b'); // does not fit: last
    await expect(page).toHaveURL(/sort=speed/);

    await page.getByTestId('sort-select').selectOption('auto');
    await page.getByTestId('tps-40').click();
    const fast = await rowNames(page);
    expect(fast).toContain('tinyllama');
    expect(fast).not.toContain('bob/huge-70b');
    for (const n of fast) expect(await speedOf(page, n!), n).toBeGreaterThanOrEqual(40);
    await expect(page.getByTestId('active-filters')).toContainText('40+ tokens/s');
    await expect(page).toHaveURL(/tps=40/);
  });

  test('the at-a-glance line counts what runs here, and each count is a shortcut', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('glance-runs')).toContainText('run on this computer');
    const runs = Number(/\d+/.exec(await page.getByTestId('glance-runs').innerText())![0]);
    expect(runs).toBeGreaterThan(5);
    await page.getByTestId('glance-runs').click();
    await expect(counter(page)).toHaveText(new RegExp(`^${runs} of 12`));
    await page.getByTestId('glance-new').click();
    await expect(page).toHaveURL(/view=new/);
  });
});

test.describe('model details', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.route('**/api/proxy?*', route => route.fulfill({ contentType: 'text/html', body: tagsHtml([['bob/coder-uncensored:7b', '4.7GB', '32K'], ['bob/coder-uncensored:14b', '9.0GB', '32K'], ['bob/coder-uncensored:latest', '4.7GB', '32K']]) }));
  });

  test('click a model to see everything: will it run, how fast, how to install, every version', async ({ page }) => {
    await page.goto('/');
    await row(page, 'bob/coder-uncensored').click();
    const drawer = page.getByTestId('model-drawer');
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(/model=bob%2Fcoder-uncensored/);
    await expect(drawer.getByTestId('drawer-title')).toHaveText('coder-uncensored');
    await expect(drawer).toContainText('by bob');
    await expect(drawer.getByTestId('drawer-fit').getByTestId('fit-good')).toBeVisible(); // 7b runs well on 12 GB; the 14b only just fits
    await expect(drawer.getByTestId('drawer-fit').getByTestId('speed')).toBeVisible();
    await expect(drawer.getByTestId('drawer-speed-text')).toContainText('words per second');
    // the real versions replace the estimates
    await expect(drawer.getByTestId('variant-row')).toHaveCount(2); // one per size: 7b and 14b ('latest' is the same file as the 7b)
    await drawer.getByTestId('show-all-versions').click();
    await expect(drawer.getByTestId('variant-row')).toHaveCount(3);
    await expect(drawer.getByTestId('variants')).toContainText('9 GB');
    await expect(drawer.getByTestId('variants')).not.toContainText(/~\d+(\.\d+)? GB/); // real sizes, not estimates
    await expect(drawer.getByTestId('variant-row').filter({ hasText: '14b' })).toHaveAttribute('data-status', 'tight');
    // the exact command for what suits this computer
    await expect(drawer.getByTestId('run-command')).toHaveText('ollama run bob/coder-uncensored');
    await expect(drawer.getByTestId('run-command-best')).toHaveText('ollama run bob/coder-uncensored:7b');
    await drawer.getByTestId('copy-run-best').click();
    await expect(drawer.getByTestId('copy-run-best')).toContainText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ollama run bob/coder-uncensored:7b');
    // and the table behind it now uses the real sizes
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page).not.toHaveURL(/model=/);
  });

  test('a shared link opens the details', async ({ page }) => {
    await page.goto('/?model=llava');
    await expect(page.getByTestId('model-drawer')).toBeVisible();
    await expect(page.getByTestId('drawer-title')).toHaveText('llava');
  });

  test('model without a good fit explains why, and cloud models say so', async ({ page }) => {
    await page.goto('/?model=bob/huge-70b');
    await expect(page.getByTestId('drawer-fit')).toContainText('needs more memory');
    await page.getByTestId('drawer-close').click();
    await page.unroute('**/api/proxy?*');
    await page.route('**/api/proxy?*', route => route.fulfill({ contentType: 'text/html', body: '<div></div>' })); // a cloud model has no downloadable versions
    await page.goto('/?model=gpt-oss-cloud');
    await expect(page.getByTestId('drawer-fit')).toContainText("Ollama's servers");
  });

  test('compare can be changed from the details', async ({ page }) => {
    await page.goto('/?model=llava');
    await page.getByTestId('drawer-compare').click();
    await expect(page.getByTestId('drawer-compare')).toContainText('Remove from compare');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('compare-count')).toHaveText('1');
  });

  test('the compare table shows speed too', async ({ page }) => {
    await page.goto('/?compare=tinyllama,qwen2.5-coder');
    await page.getByTestId('open-compare').click();
    await expect(page.getByTestId('compare-dialog')).toContainText('Speed here');
    await expect(page.getByTestId('compare-dialog').getByTestId('speed')).toHaveCount(2);
  });

  test('clicking the checkbox, publisher or link does not open the details', async ({ page }) => {
    await page.goto('/');
    await row(page, 'llava').getByTestId('compare-check').check();
    await expect(page.getByTestId('model-drawer')).toHaveCount(0);
    await row(page, 'bob/huge-70b').getByRole('button', { name: 'bob/' }).click();
    await expect(page.getByTestId('model-drawer')).toHaveCount(0);
  });
});

test.describe('tooltips', () => {
  const tip = (page: Page) => page.getByTestId('tooltip');

  test('hovering a badge explains it in plain words', async ({ page }) => {
    await page.goto('/');
    await row(page, 'qwen2.5-coder').getByTestId('fit-good').hover();
    await expect(tip(page)).toBeVisible();
    await expect(tip(page)).toContainText('Runs well');
    await expect(tip(page)).toContainText('14b version');
    await expect(tip(page)).toContainText('about 12 GB of memory on GeForce RTX 4070');
    await page.mouse.move(5, 5);
    await expect(tip(page)).toHaveCount(0);

    await row(page, 'bob/huge-70b').getByTestId('fit-no').hover();
    await expect(tip(page)).toContainText('Too big');
    await expect(tip(page)).toContainText('smallest version');
  });

  test('speed, size, downloads and capabilities say what they mean', async ({ page }) => {
    await page.goto('/');
    await row(page, 'qwen2.5-coder').getByTestId('speed').hover();
    await expect(tip(page)).toContainText('tokens per second');
    await expect(tip(page)).toContainText('words per second');
    await expect(tip(page)).toContainText('504 GB/s');
    await expect(tip(page)).toContainText('by about a third');
    await row(page, 'qwen2.5-coder').locator('svg.lucide-download').first().hover();
    await expect(tip(page)).toContainText('23,000,000 downloads');
    await row(page, 'qwen2.5-coder').getByText('0.5b – 32b').hover();
    await expect(tip(page)).toContainText('billions of parameters');
    await row(page, 'deepseek-r1').getByText('thinking', { exact: true }).hover();
    await expect(tip(page)).toContainText('step by step');
    await row(page, 'llava').getByText('vision', { exact: true }).hover();
    await expect(tip(page)).toContainText('Understands pictures');
  });

  test('tabs, filters and controls explain themselves', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('scope-community').hover();
    await expect(tip(page)).toContainText('Uploaded by other people');
    await page.getByTestId('view-trending').hover();
    await expect(tip(page)).toContainText('popular models that were updated recently');
    await page.getByTestId('glance-runs').hover();
    await expect(tip(page)).toContainText('Click to show only these');
    await page.getByTestId('theme-toggle').hover();
    await expect(tip(page)).toContainText('Switch the colours');
  });

  test('keyboard focus shows it too, and Escape hides it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('view-new').focus();
    await expect(tip(page)).toContainText('added');
    await page.keyboard.press('Escape');
    await expect(tip(page)).toHaveCount(0);
  });

  test('a tooltip never leaves the screen, even at the right edge', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('theme-toggle').hover(); // near the right edge
    await expect(tip(page)).toBeVisible();
    const vp = page.viewportSize()!;
    const b = (await tip(page).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    expect(b.y).toBeGreaterThanOrEqual(0);
    // near the top it flips below the thing it describes instead of going off the top
    const a = (await page.getByTestId('theme-toggle').boundingBox())!;
    expect(b.y >= a.y + a.height - 1 || b.y + b.height <= a.y + 1, 'does not cover what it describes').toBe(true);
  });

  test('the tooltip never gets in the way of clicking', async ({ page }) => {
    await page.goto('/');
    await row(page, 'qwen2.5-coder').getByTestId('fit-good').hover();
    await expect(tip(page)).toBeVisible();
    await row(page, 'qwen2.5-coder').getByTestId('fit-good').click(); // opens the details
    await expect(page.getByTestId('model-drawer')).toBeVisible();
    await expect(tip(page)).toHaveCount(0);
  });
});
