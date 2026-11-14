import { DEFAULT_FILTERS, type Filters, type Scope, type SortField, type View } from './filter.ts';

// Search, filters, sorting and the compare list live in the address, so any view can be shared as a link.
const SCOPES: Scope[] = ['all', 'official', 'community'];
const VIEWS: View[] = ['browse', 'new', 'trending'];
const SORTS: SortField[] = ['auto', 'name', 'versions', 'size', 'context', 'downloads', 'updated', 'speed'];
const list = (v: string | null) => (v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const num = (v: string | null) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export function filtersToQuery(f: Filters, compare: string[] = [], model = ''): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.scope !== 'all') p.set('scope', f.scope);
  if (f.view !== 'browse') p.set('view', f.view);
  if (f.caps.length) p.set('cap', f.caps.join(','));
  if (f.tasks.length) p.set('task', f.tasks.join(','));
  if (f.sort !== 'auto') { p.set('sort', f.sort); p.set('dir', f.dir); }
  if (f.updatedDays) p.set('updated', String(f.updatedDays));
  if (f.maxGB) p.set('max', String(f.maxGB));
  if (f.minContextK) p.set('ctx', String(f.minContextK));
  if (f.owner) p.set('by', f.owner);
  if (f.dedupe) p.set('dedupe', '1');
  if (f.fitOnly) p.set('fit', '1');
  if (f.minTps) p.set('tps', String(f.minTps));
  if (compare.length) p.set('compare', compare.join(','));
  if (model) p.set('model', model);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function queryToFilters(search: string): { filters: Filters; compare: string[]; model: string } {
  const p = new URLSearchParams(search);
  const pick = <T extends string>(v: string | null, allowed: T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  const filters: Filters = {
    ...DEFAULT_FILTERS,
    q: p.get('q') || '',
    scope: pick(p.get('scope'), SCOPES, 'all'),
    view: pick(p.get('view'), VIEWS, 'browse'),
    caps: list(p.get('cap')),
    tasks: list(p.get('task')),
    sort: pick(p.get('sort'), SORTS, 'auto'),
    dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
    updatedDays: num(p.get('updated')),
    maxGB: num(p.get('max')),
    minContextK: num(p.get('ctx')),
    owner: p.get('by') || '',
    dedupe: p.get('dedupe') === '1',
    fitOnly: p.get('fit') === '1',
    minTps: num(p.get('tps')),
  };
  const compare = (p.get('compare') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
  return { filters, compare, model: p.get('model') || '' };
}
