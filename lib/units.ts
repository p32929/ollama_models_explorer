// Small parsers for the sizes and numbers ollama.com shows. Pure functions, no imports.

/** "4.7GB", "338MB", "23GB - 24GB" -> gigabytes (first number with a unit). "Low Usage" and the like -> 0. */
export function parseSize(text: string): number {
  const m = /([0-9]+(?:\.[0-9]+)?)\s*(tb|gb|mb|kb)/i.exec(text || '');
  if (!m) return 0;
  const n = parseFloat(m[1]);
  switch (m[2].toLowerCase()) {
    case 'tb': return n * 1000;
    case 'gb': return n;
    case 'mb': return n / 1000;
    default: return n / 1000000;
  }
}

/** "32K" -> 32, "1M" -> 1000, "512" -> 0.512 (thousands of tokens) */
export function parseContext(text: string): number {
  if (!text) return 0;
  const n = parseFloat(text.replace(/[^0-9.]/g, ''));
  if (!n) return 0;
  const lower = text.toLowerCase();
  if (lower.includes('m')) return n * 1000;
  if (lower.includes('k')) return n;
  return n / 1000;
}

/** Parameter count in billions from a size badge: "7b" 7, "8x7b" 56, "600m" 0.6, "e4b" 4, "0.5b" 0.5. Not a size -> 0. */
export function parseParams(text: string): number {
  const m = /^e?(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?([bm])$/i.exec((text || '').trim());
  if (!m) return 0;
  const count = m[2] ? parseFloat(m[1]) * parseFloat(m[2]) : parseFloat(m[1]);
  return m[3].toLowerCase() === 'm' ? count / 1000 : count;
}

export function formatGB(gb: number): string {
  if (gb < 1) return `${Math.round(gb * 1000)} MB`;
  return `${gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10} GB`;
}

export function formatCount(n: number): string {
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);
}

/** Whole days between a YYYY-MM-DD date and now (never negative); Infinity when there is no date. */
export function daysSince(date: string | undefined, now = Date.now()): number {
  if (!date) return Infinity;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, Math.floor((now - t) / 86400000));
}
