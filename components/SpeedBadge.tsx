import { Zap } from 'lucide-react';
import type { Fit } from '@/lib/fit';
import { describeSpeed, formatTps, speedTier, TIER_LABEL, type SpeedTier } from '@/lib/speed';

const COLOURS: Record<SpeedTier, string> = {
  fast: 'text-emerald-400',
  good: 'text-lime-400',
  ok: 'text-amber-400',
  slow: 'text-red-400',
};

/** "~38 tokens/s" for a model that fits, colour-coded by how it will feel. */
export function SpeedBadge({ tps, compact = false, showTier = false }: { tps: number; compact?: boolean; showTier?: boolean }) {
  if (!(tps > 0)) return <span className="text-zinc-600" data-testid="speed-none">—</span>;
  const tier = speedTier(tps);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums" data-testid="speed" data-tier={tier} title={`Estimated ${describeSpeed(tps)}`}>
      <Zap className={`h-3.5 w-3.5 ${COLOURS[tier]}`} />
      <span className="text-zinc-100">{tps >= 399 ? '' : '~'}{formatTps(tps)}</span>
      <span className="text-zinc-500">{compact ? 'tok/s' : 'tokens/s'}</span>
      {showTier && <span className={`ml-1 text-xs ${COLOURS[tier]}`}>{TIER_LABEL[tier]}</span>}
    </span>
  );
}

export const speedOfFit = (fit: Fit) => (fit.status === 'good' || fit.status === 'tight' ? fit.tps : 0);
