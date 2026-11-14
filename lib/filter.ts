import type { ModelData } from './types';
import { fitOf, variantsOf } from './fit.ts';
import { TASK_BY_ID } from './tasks.ts';
import { daysSince, parseContext, parseSize } from './units.ts';

export type Scope = 'all' | 'official' | 'community';
export type View = 'browse' | 'new' | 'trending';
export type SortField = 'auto' | 'name' | 'versions' | 'size' | 'context' | 'downloads' | 'updated' | 'speed';
export type SortDirection = 'asc' | 'desc';

export interface Filters {
  q: string;
  scope: Scope;
  view: View;
  /** Capabilities the model must have, all of them (e.g. tools AND vision) */
  caps: string[];
  /** Quick picks the model must match, all of them (e.g. coding AND small) */
  tasks: string[];
  sort: SortField;
  dir: SortDirection;
  /** Only models updated in the last N days (0 = any) */
  updatedDays: number;
  /** Only models with a variant of at most N GB (0 = any) */
  maxGB: number;
  /** Only models with a context window of at least N thousand tokens (0 = any; official models only) */
  minContextK: number;
  /** Only models from this publisher ("" = any) */
  owner: string;
  /** Hide community copies that have the same description as a more popular model */
  dedupe: boolean;
  /** Only models that run on this computer */
  fitOnly: boolean;
  /** Only models that write at least this many tokens per second on this computer (0 = any) */
  minTps: number;
}

export const DEFAULT_FILTERS: Filters = {
  q: '', scope: 'all', view: 'browse', caps: [], tasks: [], sort: 'auto', dir: 'desc',
  updatedDays: 0, maxGB: 0, minContextK: 0, owner: '', dedupe: false, fitOnly: false, minTps: 0,
};

export const ownerOf = (m: ModelData) => (m.name.includes('/') ? m.name.split('/')[0] : '');
export const isCommunity = (m: ModelData) => m.name.includes('/');
export const maxContextK = (m: ModelData) => Math.max(0, ...m.versions.map(v => parseContext(v.context)));
const minSizeGB = (m: ModelData) => { const v = variantsOf(m); return v.length ? v[0].sizeGB : 0; };

/** Which filters are active (not counting the search box, scope and view, which have their own controls) */
export function activeFilterCount(f: Filters): number {
  return [f.caps.length, f.tasks.length, f.updatedDays, f.maxGB, f.minContextK, f.owner, f.dedupe, f.fitOnly, f.minTps].filter(Boolean).length;
}

export const isNewModel = (m: ModelData, now = Date.now()) => daysSince(m.firstSeen, now) <= 30 || daysSince(m.updated, now) <= 14;

/** "Heat": popular and recently touched models rank first. Used for Trending until download growth is known. */
export const heatOf = (m: ModelData, now = Date.now()) => (m.pullsCount || 0) * Math.exp(-Math.min(daysSince(m.updated, now), 720) / 45);

export function hasGrowthData(models: ModelData[]): boolean {
  return models.some(m => (m.growth || 0) > 0);
}

export interface Result {
  models: ModelData[];
  /** Community copies hidden by "hide near-duplicates" */
  hiddenDuplicates: number;
}

/** What the visitor's computer can do. A bare number means "this much memory, speed unknown". */
export type Machine = number | { memoryGB: number; bandwidthGBs?: number };

export function applyFilters(all: ModelData[], f: Filters, machine: Machine, now = Date.now(), liveNames?: Set<string>): Result {
  const memoryGB = typeof machine === 'number' ? machine : machine.memoryGB;
  const bandwidth = typeof machine === 'number' ? 0 : machine.bandwidthGBs || 0;
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const tasks = f.tasks.map(id => TASK_BY_ID[id]).filter(Boolean);
  const owner = f.owner.toLowerCase();

  let list = all.filter(m => {
    const community = isCommunity(m);
    if (f.scope === 'official' && community) return false;
    if (f.scope === 'community' && !community) return false;
    if (owner && ownerOf(m).toLowerCase() !== owner) return false;
    if (f.caps.length && !f.caps.every(c => m.capabilities.some(x => x.toLowerCase() === c))) return false;
    if (tasks.length && !tasks.every(t => t.match(m))) return false;
    if (f.updatedDays && !(daysSince(m.updated, now) <= f.updatedDays)) return false;
    if (f.view === 'new' && !isNewModel(m, now)) return false;
    if (f.maxGB) { const s = minSizeGB(m); if (!s || s > f.maxGB) return false; }
    if (f.minContextK && maxContextK(m) < f.minContextK) return false;
    if (f.fitOnly) { const s = fitOf(m, memoryGB).status; if (s !== 'good' && s !== 'tight') return false; }
    if (f.minTps && bandwidth) { const x = fitOf(m, memoryGB, bandwidth); if ((x.status !== 'good' && x.status !== 'tight') || x.tps < f.minTps) return false; }
    if (words.length && !(liveNames?.has(m.name))) {
      const hay = `${m.name} ${m.description} ${m.capabilities.join(' ')}`.toLowerCase();
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });

  let hiddenDuplicates = 0;
  if (f.dedupe) {
    const best = new Map<string, ModelData>();
    for (const m of list) {
      const key = m.description.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!isCommunity(m) || key.length < 25) continue;
      const cur = best.get(key);
      if (!cur || (m.pullsCount || 0) > (cur.pullsCount || 0)) best.set(key, m);
    }
    const before = list.length;
    list = list.filter(m => {
      const key = m.description.toLowerCase().replace(/\s+/g, ' ').trim();
      return !isCommunity(m) || key.length < 25 || best.get(key) === m;
    });
    hiddenDuplicates = before - list.length;
  }

  const sort: SortField = f.sort === 'auto' ? (f.view === 'new' ? 'updated' : 'downloads') : f.sort;
  const sign = f.sort === 'auto' ? -1 : f.dir === 'asc' ? 1 : -1;
  const trending = f.view === 'trending' && f.sort === 'auto';
  const growthKnown = trending && hasGrowthData(all);
  const value = (m: ModelData): number | string => {
    if (trending) return growthKnown ? (m.growth || 0) : heatOf(m, now);
    switch (sort) {
      case 'name': return m.name.toLowerCase();
      case 'versions': return m.versions.length || m.tagsCount || 0;
      case 'size': return minSizeGB(m);
      case 'context': return maxContextK(m);
      case 'updated': return m.updated || '';
      case 'speed': { const x = fitOf(m, memoryGB, bandwidth); return x.status === 'good' || x.status === 'tight' ? x.tps : -1; }
      default: return m.pullsCount || 0;
    }
  };
  list = list.sort((a, b) => {
    const x = value(a), y = value(b);
    if (x < y) return -sign;
    if (x > y) return sign;
    return a.name < b.name ? -1 : 1;
  });
  return { models: list, hiddenDuplicates };
}

/** Size column text */
export function sizeSummary(m: ModelData): string {
  if (m.versions.length) {
    const sizes = m.versions.map(v => v.size).filter(Boolean);
    const measurable = sizes.filter(s => parseSize(s) > 0);
    if (!measurable.length) return Array.from(new Set(sizes)).join(', ') || 'N/A';
    const sorted = [...measurable].sort((a, b) => parseSize(a) - parseSize(b));
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    return lo === hi ? lo : `${lo} – ${hi}`;
  }
  const s = m.sizes || [];
  if (!s.length) return 'N/A';
  return s.length > 3 ? `${s[0]} – ${s[s.length - 1]}` : s.join(' · ');
}
