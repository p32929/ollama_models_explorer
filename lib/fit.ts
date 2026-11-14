import type { ModelData } from './types';
import { parseParams, parseSize } from './units.ts';

export type FitStatus = 'good' | 'tight' | 'no' | 'cloud' | 'unknown';

export interface Variant {
  /** "7b", or the tag name for official models */
  label: string;
  /** Download size in GB (measured for official models, estimated from the parameter count for the rest) */
  sizeGB: number;
  estimated: boolean;
}

export interface Fit {
  status: FitStatus;
  /** The biggest variant that runs comfortably, e.g. "14b" */
  best?: Variant;
  /** The smallest variant */
  smallest?: Variant;
  variants: Variant[];
}

// A 4-bit model takes about 0.58 GB per billion parameters, plus a little for the runtime
const GB_PER_BILLION = 0.58;
const estimateGB = (billions: number) => billions * GB_PER_BILLION + 0.3;

// Memory needed to actually run a model of a given file size (context cache and runtime overhead)
const need = (sizeGB: number) => sizeGB * 1.15 + 0.5;

const variantCache = new WeakMap<ModelData, Variant[]>();

export function variantsOf(model: ModelData): Variant[] {
  const cached = variantCache.get(model);
  if (cached) return cached;
  const out = computeVariants(model);
  variantCache.set(model, out);
  return out;
}

function computeVariants(model: ModelData): Variant[] {
  const out: Variant[] = [];
  for (const v of model.versions) {
    const gb = parseSize(v.size);
    if (gb > 0) {
      const tag = v.name.split(':')[1] || v.name;
      out.push({ label: /^(e?\d+(?:\.\d+)?(?:x\d+)?[bm])\b/i.exec(tag)?.[1] || tag, sizeGB: gb, estimated: false }); // "32b-instruct-q4_K_M" -> "32b"
    }
  }
  if (out.length) return out.sort((a, b) => a.sizeGB - b.sizeGB);
  for (const s of model.sizes || []) {
    const b = parseParams(s);
    if (b > 0) out.push({ label: s, sizeGB: estimateGB(b), estimated: true });
  }
  return out.sort((a, b) => a.sizeGB - b.sizeGB);
}

/** Will this model run on a machine with this much usable memory? */
export function fitOf(model: ModelData, memoryGB: number): Fit {
  const variants = variantsOf(model);
  const cloud = model.capabilities.some(c => c.toLowerCase() === 'cloud');
  if (!variants.length) return { status: cloud ? 'cloud' : 'unknown', variants };
  const smallest = variants[0];
  const good = variants.filter(v => need(v.sizeGB) <= memoryGB * 0.9);
  if (good.length) return { status: 'good', best: good[good.length - 1], smallest, variants };
  if (need(smallest.sizeGB) <= memoryGB) return { status: 'tight', best: smallest, smallest, variants };
  // nothing fits locally: models that also run on Ollama's servers can still be used
  return { status: cloud ? 'cloud' : 'no', smallest, variants };
}
