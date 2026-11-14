import catalogueJson from '../public/ollama-catalogue.json';
import { rowToModel } from './catalogue.ts';
import type { Catalogue, ModelData } from './types';

// The saved list, loaded once per server process (used by the JSON API and the feed).
const data = catalogueJson as unknown as Catalogue;
let cache: ModelData[] | null = null;

export function serverModels(): ModelData[] {
  if (!cache) cache = data.models.map(rowToModel);
  return cache;
}
export const generatedAt = data.generatedAt;
