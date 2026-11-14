// How fast will a model write on this computer?
//
// Writing a word means reading the whole model from memory once, so the speed is set by how fast memory can be
// read (bandwidth), not by how clever the chip is:
//
//     tokens per second  ≈  efficiency × memory bandwidth ÷ bytes read per token
//
// Bytes read per token is the model's file size, except for "mixture of experts" models, which only read the
// experts they use for each token (a small fraction of the file). Real speeds vary by about ±30% with the
// program, the context length and the quantisation, so this is an estimate and is shown with a "~".

export type SpeedTier = 'fast' | 'good' | 'ok' | 'slow';

/** Real programs reach roughly this share of the theoretical memory speed. */
export const EFFICIENCY = 0.65;
const MAX_TPS = 400; // above this the estimate means nothing

// Mixture-of-experts models whose tag does not say how many parameters are active: [name pattern, total size in billions, active billions]
const KNOWN_MOE: [RegExp, number, number][] = [
  [/gpt-oss/i, 20, 3.6], [/gpt-oss/i, 120, 5.1],
  [/deepseek-(r1|v3)/i, 671, 37],
  [/llama4|llama-4/i, 109, 17], [/llama4|llama-4/i, 400, 17],
  [/kimi-k2/i, 1000, 32],
  [/qwen3-coder/i, 480, 35],
  [/qwen3/i, 235, 22],
  [/glm-4\.5-air|glm4\.5-air/i, 106, 12], [/glm-4\.[567]|glm4\.[567]/i, 355, 32],
  [/minimax-m2/i, 230, 10],
];

/**
 * The share of a model that is read for each token: 1 for ordinary ("dense") models, much less for mixture of experts.
 * `tag` is the version name ("30b-a3b-q4_K_M", "8x7b", "latest").
 */
export function activeFraction(modelName: string, tag: string, sizeGB = 0): number {
  const a = /(\d+(?:\.\d+)?)b-a(\d+(?:\.\d+)?)b/i.exec(tag); // "30b-a3b": 3 of 30 billion are active
  if (a) return Math.min(1, parseFloat(a[2]) / parseFloat(a[1]));
  const x = /(\d+)x(\d+(?:\.\d+)?)b/i.exec(tag); // "8x7b": two experts of eight, plus the parts every expert shares
  if (x) return Math.min(1, 2.2 / parseInt(x[1], 10));
  const size = /^e?(\d+(?:\.\d+)?)([bt])/i.exec(tag);
  if (size) {
    const total = parseFloat(size[1]) * (size[2].toLowerCase() === 't' ? 1000 : 1);
    const known = KNOWN_MOE.find(([re, t]) => re.test(modelName) && Math.abs(t - total) / t < 0.2);
    if (known) return known[2] / known[1];
  } else if (sizeGB > 0) {
    // the tag names no size ("latest"): work out the parameter count from the file size (about 0.58 GB per billion at 4 bits)
    const total = Math.max(0, sizeGB - 0.3) / 0.58;
    const known = KNOWN_MOE.find(([re, t]) => re.test(modelName) && Math.abs(t - total) / t < 0.25);
    if (known) return known[2] / known[1];
  }
  return 1;
}

export function tokensPerSecond(sizeGB: number, fraction: number, bandwidthGBs: number): number {
  if (!(sizeGB > 0) || !(bandwidthGBs > 0)) return 0;
  return Math.min(MAX_TPS, (EFFICIENCY * bandwidthGBs) / Math.max(sizeGB * fraction, 0.05));
}

export function speedTier(tps: number): SpeedTier {
  if (tps >= 40) return 'fast';
  if (tps >= 15) return 'good';
  if (tps >= 5) return 'ok';
  return 'slow';
}

export const TIER_LABEL: Record<SpeedTier, string> = { fast: 'Very fast', good: 'Smooth', ok: 'Usable', slow: 'Slow' };

/** Roughly how many words per second that is (a token is about three quarters of a word). */
export const wordsPerSecond = (tps: number) => Math.max(1, Math.round(tps * 0.75));

export function formatTps(tps: number): string {
  if (tps >= MAX_TPS - 1) return `${MAX_TPS}+`;
  if (tps >= 100) return `${Math.round(tps / 10) * 10}`;
  if (tps >= 10) return `${Math.round(tps)}`;
  return tps.toFixed(1);
}

/** One plain sentence about what a speed feels like. */
export function describeSpeed(tps: number): string {
  const words = wordsPerSecond(tps);
  const feel = tps >= 40 ? 'much faster than you can read' : tps >= 15 ? 'about as fast as you read, comfortable for chat' : tps >= 5 ? 'you can follow it, but you will wait' : 'very slow, one word at a time';
  return `about ${words} words per second (${feel})`;
}
