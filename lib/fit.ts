import type { ModelData } from './types';
import { parseParams, parseSize } from './units.ts';
import { activeFraction, tokensPerSecond } from './speed.ts';

export type FitStatus = 'good' | 'tight' | 'no' | 'cloud' | 'unknown';

export interface Variant {
  /** "7b", or the tag name for official models */
  label: string;
  /** The full version name ("30b-a3b-q4_K_M"), used to tell whether it is a mixture-of-experts model */
  tag: string;
  /** Share of the file read for each token (1 = all of it) */
  fraction: number;
  /** Download size in GB (measured for official models, estimated from the parameter count for the rest) */
  sizeGB: number;
  estimated: boolean;
}

/**
 * One version per model size: models come in dozens of builds of the same size (4-bit, 8-bit, base, instruct...).
 * The recommended build is the usual 4-bit one ("q4_K_M"); failing that, the smallest that is not a very low-quality 2 or 3-bit build.
 */
export function representatives(variants: Variant[]): Variant[] {
  const groups = new Map<string, Variant[]>();
  for (const v of variants) groups.set(v.label, [...(groups.get(v.label) || []), v]);
  const picked: Variant[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.sizeGB - b.sizeGB);
    picked.push(
      group.find(v => /q4_k_m/i.test(v.tag)) ||
      group.find(v => v.tag === v.label || v.tag === `${v.label}-instruct`) ||
      sorted.find(v => !/q[23]_|iq[123]/i.test(v.tag)) ||
      sorted[0],
    );
  }
  // "latest" is only another name for one of the builds: skip it when a named build has the same size
  const named = picked.filter(v => !(v.tag === 'latest' && picked.some(o => o !== v && Math.abs(o.sizeGB - v.sizeGB) < 0.01)));
  return named.sort((a, b) => a.sizeGB - b.sizeGB || (a.tag === 'latest' ? -1 : b.tag === 'latest' ? 1 : 0));
}

export interface Fit {
  status: FitStatus;
  /** The biggest variant that runs comfortably, e.g. "14b" */
  best?: Variant;
  /** Estimated tokens per second of the best variant on this computer (0 when unknown) */
  tps: number;
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
      out.push({ label: /^(e?\d+(?:\.\d+)?(?:x\d+)?[bm])\b/i.exec(tag)?.[1] || tag, tag, fraction: activeFraction(model.name, tag, gb), sizeGB: gb, estimated: false }); // "32b-instruct-q4_K_M" -> "32b"
    }
  }
  // equal sizes: put "latest" first so a named version ("7b") is the one picked as the best
  if (out.length) return out.sort((a, b) => a.sizeGB - b.sizeGB || (a.tag === 'latest' ? -1 : b.tag === 'latest' ? 1 : 0));
  for (const s of model.sizes || []) {
    const b = parseParams(s);
    if (b > 0) out.push({ label: s, tag: s, fraction: activeFraction(model.name, s), sizeGB: estimateGB(b), estimated: true });
  }
  return out.sort((a, b) => a.sizeGB - b.sizeGB);
}

/** Will this model run on a machine with this much usable memory? */
/** Estimated tokens per second of a variant on a computer with this memory bandwidth */
export const variantTps = (v: Variant, bandwidthGBs: number) => tokensPerSecond(v.sizeGB, v.fraction, bandwidthGBs);

/** Models that turn text into numbers (embeddings) do not write words, so "tokens per second" means nothing for them. */
const writesText = (m: ModelData) => !m.capabilities.some(c => c.toLowerCase() === 'embedding') && !/embed/i.test(m.name);

export function fitOf(model: ModelData, memoryGB: number, bandwidthGBs = 0): Fit {
  const variants = variantsOf(model);
  const speed = (v: Variant) => (writesText(model) ? variantTps(v, bandwidthGBs) : 0);
  const cloud = model.capabilities.some(c => c.toLowerCase() === 'cloud');
  if (!variants.length) return { status: cloud ? 'cloud' : 'unknown', variants, tps: 0 };
  const smallest = variants[0];
  const good = representatives(variants).filter(v => need(v.sizeGB) <= memoryGB * 0.9);
  if (good.length) { const best = good[good.length - 1]; return { status: 'good', best, smallest, variants, tps: speed(best) }; }
  if (need(smallest.sizeGB) <= memoryGB) return { status: 'tight', best: smallest, smallest, variants, tps: speed(smallest) };
  // nothing fits locally: models that also run on Ollama's servers can still be used
  return { status: cloud ? 'cloud' : 'no', smallest, variants, tps: 0 };
}
