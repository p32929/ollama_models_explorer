// The facts shown on every list row, so nobody has to open a model to learn them:
// how many parameters (smallest to biggest), how big the download is, and whether the model is
// "dense" (all of it works for every word) or "mixture of experts" (only a part of it does).
import type { ModelData } from './types';
import { representatives, variantsOf } from './fit.ts';
import { formatGB, parseParams } from './units.ts';

export type ModelKind = 'dense' | 'moe' | 'mixed' | 'unknown';

export interface Specs {
  /** "8B – 405B", "7B", or "" when the sizes are unknown */
  params: string;
  /** How many different sizes it comes in */
  sizeCount: number;
  /** "4.7 GB – 243 GB" (one recommended build per size), or "" */
  download: string;
  kind: ModelKind;
  /** For mixture-of-experts models: "~3B active" */
  active: string;
}

export function formatParams(billions: number): string {
  if (billions < 1) return `${Math.round(billions * 1000)}M`;
  return `${billions >= 10 ? Math.round(billions) : Math.round(billions * 10) / 10}B`;
}

const cache = new WeakMap<ModelData, Specs>();

export function specsOf(model: ModelData): Specs {
  const hit = cache.get(model);
  if (hit) return hit;
  const reps = representatives(variantsOf(model));
  const sized = reps.map(v => ({ v, b: parseParams(v.label) })).filter(x => x.b > 0).sort((a, b) => a.b - b.b);
  const lo = sized[0], hi = sized[sized.length - 1];
  const gbs = reps.map(v => v.sizeGB).sort((a, b) => a - b);
  const moe = reps.filter(v => v.fraction < 1);
  const kind: ModelKind = !reps.length ? 'unknown' : moe.length === 0 ? 'dense' : moe.length === reps.length ? 'moe' : 'mixed';
  const bigMoe = moe.map(v => ({ v, b: parseParams(v.label) })).filter(x => x.b > 0).sort((a, b) => b.b - a.b)[0];
  const est = reps.length > 0 && reps.every(v => v.estimated) ? '~' : '';
  const out: Specs = {
    params: lo ? (lo.b === hi.b ? formatParams(lo.b) : `${formatParams(lo.b)} – ${formatParams(hi.b)}`) : '',
    sizeCount: new Set(sized.map(x => x.v.label)).size,
    download: gbs.length ? (gbs[0] === gbs[gbs.length - 1] ? `${est}${formatGB(gbs[0])}` : `${est}${formatGB(gbs[0])} – ${formatGB(gbs[gbs.length - 1])}`) : '',
    kind,
    active: bigMoe ? `~${formatParams(bigMoe.b * bigMoe.v.fraction)} active` : '',
  };
  cache.set(model, out);
  return out;
}

export const KIND_LABEL: Record<ModelKind, string> = { dense: 'Dense', moe: 'Mixture of experts', mixed: 'Dense + experts', unknown: 'Unknown' };
