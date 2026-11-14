import type { Catalogue, CatalogueRow, ModelData } from './types';

import { formatCount } from './units.ts';

/** Turns a compact catalogue row into the shape the table uses. Official models have no "/" in their name. */
export function rowToModel([path, description, capabilities, pullsCount, tagsCount, sizes, updated, firstSeen, prevPulls, prevDate]: CatalogueRow): ModelData {
  const community = path.includes('/');
  return {
    name: path,
    url: `https://ollama.com/${community ? path : `library/${path}`}`,
    description,
    capabilities,
    pulls: pullsCount ? formatCount(pullsCount) : '',
    tags: tagsCount ? String(tagsCount) : '',
    updated,
    versions: [],
    community,
    pullsCount,
    tagsCount,
    sizes,
    firstSeen: firstSeen || '',
    growth: prevPulls ? Math.max(0, pullsCount - prevPulls) : undefined,
    growthSince: prevDate || undefined,
  };
}

/** Loads the saved list of every model on ollama.com (built by scripts/crawl-catalogue.mjs). */
export async function loadCatalogue(): Promise<{ models: ModelData[]; generatedAt: string } | null> {
  try {
    const res = await fetch('/ollama-catalogue.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as Catalogue;
    return { models: data.models.map(rowToModel), generatedAt: data.generatedAt };
  } catch {
    return null;
  }
}
