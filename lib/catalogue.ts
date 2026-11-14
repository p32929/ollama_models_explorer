import { Catalogue, CatalogueRow, ModelData } from './types';

const formatCount = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

/** Turns a compact catalogue row into the shape the table uses. Official models have no "/" in their name. */
export function rowToModel([path, description, capabilities, pullsCount, tagsCount, sizes, updated]: CatalogueRow): ModelData {
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
