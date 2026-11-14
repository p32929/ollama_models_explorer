import type { Page } from '@playwright/test';

const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// [path, description, capabilities, downloads, tags, sizes, updated, firstSeen, previousDownloads, previousDate]
export const ROWS: any[] = [
  ['llama3.1', 'Llama 3.1 is a new state-of-the-art model from Meta available in 8B, 70B and 405B parameter sizes.', ['tools'], 121_000_000, 93, ['8b', '70b', '405b'], daysAgo(300), '', 120_900_000, daysAgo(7)],
  ['qwen2.5-coder', 'The latest series of Code-Specific Qwen models, with significant improvements in code generation.', ['tools'], 23_000_000, 199, ['0.5b', '1.5b', '7b', '14b', '32b'], daysAgo(200), '', 22_990_000, daysAgo(7)],
  ['tinyllama', 'The TinyLlama project is an open endeavor to train a compact 1.1B Llama model.', [], 3_000_000, 5, ['1.1b'], daysAgo(400), '', 2_999_990, daysAgo(7)],
  ['llava', 'LLaVA is a multimodal vision model that understands images and text together.', ['vision'], 9_000_000, 17, ['7b', '13b', '34b'], daysAgo(250), '', 8_999_900, daysAgo(7)],
  ['nomic-embed-text', 'A high-performing open embedding model with a large token context window.', ['embedding'], 97_000_000, 3, [], daysAgo(500), '', 96_999_000, daysAgo(7)],
  ['deepseek-r1', 'DeepSeek-R1 is a family of open reasoning models with performance approaching leading models.', ['tools', 'thinking'], 95_000_000, 35, ['1.5b', '7b', '70b', '671b'], daysAgo(60), '', 94_000_000, daysAgo(7)],
  ['gpt-oss-cloud', 'A big model that runs on Ollama cloud servers.', ['cloud', 'thinking'], 1_000_000, 2, [], daysAgo(3), daysAgo(2), 0, ''],
  ['bob/coder-uncensored', 'An uncensored coding model by Bob that is quite long and descriptive for testing.', ['tools'], 500_000, 4, ['7b'], daysAgo(5), daysAgo(4), 0, ''],
  ['bob/huge-70b', 'A very large 70b model by bob for those with a lot of memory.', [], 80_000, 2, ['70b'], daysAgo(400), '', 79_990, daysAgo(7)],
  ['eve/coder-copy', 'An uncensored coding model by Bob that is quite long and descriptive for testing.', ['tools'], 9_000, 3, ['7b'], daysAgo(40), '', 8_000, daysAgo(7)],
  ['carol/translator', 'Translation between many languages, multilingual and small.', [], 120_000, 2, ['3b'], daysAgo(10), '', 119_000, daysAgo(7)],
  ['dave/storyteller', 'A roleplay character chat model for stories.', [], 60_000, 2, ['8b'], daysAgo(900), '', 59_999, daysAgo(7)],
];

/** A small, fixed list of models so tests do not depend on what ollama.com has today. */
export async function useFixtureCatalogue(page: Page, rows: any[] = ROWS, opts: { withGrowth?: boolean } = {}) {
  const withGrowth = opts.withGrowth ?? true;
  const data = rows.map(r => (withGrowth ? r : [...r.slice(0, 7), r[7], 0, '']));
  // the server may remember a live read of the official models from earlier; tests start from a clean slate
  await page.route('**/api/models', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ models: [], status: 'ready' }) }));
  await page.route('**/ollama-catalogue.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ generatedAt: `${TODAY}T03:00:00.000Z`, count: data.length, models: data }),
  }));
}

/** Pretend the browser has this graphics card (WebGL) and platform, so "detect my computer" can be tested. */
export async function fakeHardware(page: Page, opts: { gpu?: string; platform?: string; deviceMemory?: number }) {
  await page.addInitScript(({ gpu, platform, deviceMemory }) => {
    if (platform) {
      Object.defineProperty(navigator, 'platform', { get: () => platform, configurable: true });
      Object.defineProperty(navigator, 'userAgentData', { get: () => undefined, configurable: true });
      Object.defineProperty(navigator, 'gpu', { get: () => undefined, configurable: true }); // no WebGPU: only the WebGL card name below
      Object.defineProperty(navigator, 'userAgent', { get: () => (platform.startsWith('Mac') ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' : platform === 'Linux' ? 'Mozilla/5.0 (X11; Linux x86_64)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), configurable: true });
    }
    if (deviceMemory !== undefined) Object.defineProperty(navigator, 'deviceMemory', { get: () => deviceMemory, configurable: true });
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: any[]) {
      if (gpu !== undefined && /webgl/.test(type)) {
        return {
          getExtension: (n: string) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 37446 } : null),
          getParameter: (p: number) => (p === 37446 ? gpu : ''),
        } as any;
      }
      return (real as any).call(this, type, ...rest);
    } as any;
  }, opts);
}
