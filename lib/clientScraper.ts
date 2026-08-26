import { ModelData, ModelVersion } from './types';

// Rate limiting utility for client-side requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Safety net so a malformed "next page" link can never spin forever
const MAX_SEARCH_PAGES = 100;

async function fetchViaProxy(path: string, htmxFragment = false): Promise<Document> {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(`https://ollama.com${path}`)}${htmxFragment ? '&hx=1' : ''}`;
  const response = await fetch(proxyUrl);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

const classOf = (el: Element) => el.getAttribute('class') || '';

// Size badges ("27b", "8x7b", "600m", "e4b") sit next to the capability badges
// but aren't capabilities, so they're kept out of the capability list. They are
// the blue ones; the shape check is a fallback in case the styling changes.
const isSizeBadge = (badge: Element) =>
  classOf(badge).includes('text-blue-600') ||
  /^e?\d+(\.\d+)?(x\d+(\.\d+)?)?[bm]$/i.test(badge.textContent?.trim() || '');

function parseModelListItem(li: Element): ModelData | null {
  const link = li.querySelector('a[href^="/library/"]');
  const href = link?.getAttribute('href');
  if (!href) return null;

  const heading = li.querySelector('h2');
  const name = heading?.textContent?.trim() || href.replace('/library/', '');
  const description = heading?.parentElement?.querySelector('p')?.textContent?.trim() || '';

  const capabilities: string[] = [];
  li.querySelectorAll('span.rounded-md').forEach(badge => {
    const text = badge.textContent?.trim();
    if (text && !isSizeBadge(badge)) capabilities.push(text);
  });

  // Stats row: pulls, tags and updated time, each a span holding a CSS-hidden
  // label ("&nbsp;Pulls", "Updated&nbsp;") plus the visible value.
  let pulls = '';
  let tags = '';
  let updated = '';

  const statsRow = li.querySelector('p.space-x-5');
  statsRow?.querySelectorAll(':scope > span').forEach(stat => {
    const spans = Array.from(stat.querySelectorAll('span'));
    const label = spans.map(s => s.textContent || '').join(' ');
    const value = (spans.find(s => !classOf(s).includes('hidden')) || spans[0])
      ?.textContent?.trim() || '';

    if (/pull/i.test(label)) pulls = value;
    else if (/tag/i.test(label)) tags = value;
    else if (/updated/i.test(label)) updated = value;
  });

  return {
    name,
    url: `https://ollama.com${href}`,
    description,
    capabilities,
    pulls,
    tags,
    updated,
    versions: []
  };
}

async function fetchModelDetails(modelPath: string): Promise<ModelVersion[]> {
  try {
    // The model page only previews a few tags; /tags lists every version.
    const doc = await fetchViaProxy(`${modelPath}/tags`);
    const versions: ModelVersion[] = [];

    doc.querySelectorAll('div.group').forEach(row => {
      const link = row.querySelector('a[href^="/library/"]');
      const href = link?.getAttribute('href');
      if (!href || !href.includes(':')) return;

      const grid = row.querySelector('div.grid-cols-12');
      if (!grid) return;

      const cells = Array.from(grid.querySelectorAll('.col-span-2'));

      // Digest line: "<hash> · <size> · <context> · <input> · <updated>"
      const meta = Array.from(row.querySelectorAll('.font-mono'))
        .map(el => el.parentElement?.textContent || '')
        .find(text => /[·•]/.test(text)) || '';
      const metaParts = meta.split(/[·•]/).map(s => s.trim()).filter(Boolean);

      // Cloud models draw their "Size / Usage" cell as a meter with no text,
      // so fall back to the usage tier ("Medium Usage") from the digest line.
      const size = cells[0]?.textContent?.trim() || (metaParts.length > 2 ? metaParts[1] : '');

      versions.push({
        name: href.replace('/library/', ''),
        size,
        context: cells[1]?.textContent?.trim() || '',
        input: cells[2]?.textContent?.trim() || '',
        updated: metaParts.length > 1 ? metaParts[metaParts.length - 1] : '',
        isLatest: row.querySelector('span.border-blue-500') !== null,
        url: `https://ollama.com${href}`
      });
    });

    // The same version is rendered twice (mobile + desktop); keep one of each.
    const byName: { [key: string]: ModelVersion } = {};
    versions.forEach(version => {
      const existing = byName[version.name];
      byName[version.name] = existing
        ? { ...existing, ...version, updated: version.updated || existing.updated }
        : version;
    });

    return Object.values(byName);
  } catch (error) {
    console.error(`Error fetching model details from ${modelPath}:`, error);
    return [];
  }
}

export async function scrapeOllamaModels(
  limit: number = Infinity,
  onProgress?: (message: string, current?: number, total?: number) => void
): Promise<ModelData[]> {
  try {
    onProgress?.('🚀 Starting scrape from Ollama.com');

    // The search page is infinite-scrolled: each page ends with an htmx
    // sentinel pointing at the next one, and the last page has none.
    const models: ModelData[] = [];
    let nextPath: string | null = '/search';
    let page = 0;

    while (nextPath && models.length < limit && page < MAX_SEARCH_PAGES) {
      page++;
      onProgress?.(`🌐 Fetching model list page ${page} from ollama.com`);

      const doc: Document = await fetchViaProxy(nextPath, page > 1);

      let foundOnPage = 0;
      doc.querySelectorAll('li').forEach(li => {
        if (models.length >= limit) return;
        const model = parseModelListItem(li);
        if (model) {
          models.push(model);
          foundOnPage++;
        }
      });

      if (foundOnPage === 0) break;

      const sentinel = doc.querySelector('li[hx-get^="/search"]');
      nextPath = sentinel?.getAttribute('hx-get') || null;
    }

    if (models.length === 0) {
      throw new Error('No models found on ollama.com — the page layout may have changed');
    }

    onProgress?.(`📋 Found ${models.length} models across ${page} page(s)`);
    onProgress?.(`🔄 Fetching detailed info for ${models.length} models`);

    // Fetch model details with higher concurrency for client-side scraping
    const concurrencyLimit = 8; // Increased from 2 to 8 for faster scraping
    let completedDetails = 0;

    for (let i = 0; i < models.length; i += concurrencyLimit) {
      const batch = models.slice(i, i + concurrencyLimit);

      const batchPromises = batch.map(async (model) => {
        try {
          const versions = await fetchModelDetails(model.url.replace('https://ollama.com', ''));
          completedDetails++;

          if (completedDetails % 3 === 0 || completedDetails <= 2) {
            onProgress?.(`✨ Got details for ${model.name} (${completedDetails}/${models.length})`, completedDetails, models.length);
          }

          return {
            ...model,
            versions
          };
        } catch (error: any) {
          onProgress?.(`⚠️ Failed to get details for ${model.name}: ${error.message}`);
          completedDetails++;
          // Return model without versions if detail fetch fails
          return {
            ...model,
            versions: []
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // Update the original models array with results
      for (let j = 0; j < batchResults.length; j++) {
        models[i + j] = batchResults[j];
      }

      // Shorter delay between batches for faster processing
      if (i + concurrencyLimit < models.length) {
        await delay(200); // Reduced from 1000ms to 200ms
      }
    }

    onProgress?.(`🎉 Scraping completed! Found ${models.length} models`);
    return models;

  } catch (error: any) {
    onProgress?.(`❌ Scraping failed: ${error.message}`);
    throw error;
  }
}
