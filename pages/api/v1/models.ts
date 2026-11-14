import type { NextApiRequest, NextApiResponse } from 'next';
import { serverModels, generatedAt } from '@/lib/catalogueServer';
import { applyFilters, DEFAULT_FILTERS, type Filters, type SortField, type Scope } from '@/lib/filter';
import { fitOf } from '@/lib/fit';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';
const num = (v: string | string[] | undefined, fallback = 0) => { const n = Number(one(v)); return Number.isFinite(n) && n >= 0 ? n : fallback; };

/**
 * Public JSON API over the full list of Ollama models.
 *
 *   GET /api/v1/models?q=coder&scope=community&cap=tools&sort=downloads&order=desc&limit=50&offset=0
 *   cap= and task= take several values separated by commas (the model must match all of them)
 *   also: owner=, updated=<days>, max_gb=, min_context_k=, new=1, memory_gb=<GB> (adds "fit" for that much memory)
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Only GET is supported' });

  const sortParam = one(req.query.sort) as SortField;
  const sort: SortField = ['name', 'size', 'context', 'downloads', 'updated', 'versions'].includes(sortParam) ? sortParam : 'downloads';
  const scopeParam = one(req.query.scope);
  const filters: Filters = {
    ...DEFAULT_FILTERS,
    q: one(req.query.q),
    scope: (['official', 'community'].includes(scopeParam) ? scopeParam : 'all') as Scope,
    view: one(req.query.new) === '1' ? 'new' : 'browse',
    caps: one(req.query.cap).toLowerCase().split(',').filter(Boolean),
    tasks: one(req.query.task).split(',').filter(Boolean),
    sort,
    dir: one(req.query.order) === 'asc' ? 'asc' : 'desc',
    updatedDays: num(req.query.updated),
    maxGB: num(req.query.max_gb),
    minContextK: num(req.query.min_context_k),
    owner: one(req.query.owner),
    dedupe: one(req.query.dedupe) === '1',
  };
  const memory = num(req.query.memory_gb);
  const { models } = applyFilters(serverModels(), filters, memory || 1e9);
  const limit = Math.min(Math.max(num(req.query.limit, 50), 1), 500);
  const offset = num(req.query.offset);
  const page = models.slice(offset, offset + limit).map(m => ({
    name: m.name,
    url: m.url,
    publisher: m.name.includes('/') ? m.name.split('/')[0] : 'ollama',
    official: !m.name.includes('/'),
    description: m.description,
    capabilities: m.capabilities,
    downloads: m.pullsCount || 0,
    tags: m.tagsCount || 0,
    sizes: m.sizes || [],
    updated: m.updated || null,
    first_seen: m.firstSeen || null,
    downloads_gained: m.growth ?? null,
    ...(memory ? { fit: fitOf(m, memory).status } : {}),
  }));
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).json({ total: models.length, offset, count: page.length, generated_at: generatedAt, models: page });
}
