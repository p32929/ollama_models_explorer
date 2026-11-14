import { Check, Cloud, AlertTriangle, X } from 'lucide-react';
import type { Fit } from '@/lib/fit';
import { explainFit, type Machine } from '@/lib/explain';
import { Tip } from './Tip';

/** Whether a model runs on the visitor's computer, in a few words. */
export function FitBadge({ fit, compact = false, machine }: { fit: Fit; compact?: boolean; machine?: Machine }) {
  return <Tip tip={explainFit(fit, machine)}><FitBadgeBody fit={fit} compact={compact} /></Tip>;
}

function FitBadgeBody({ fit, compact }: { fit: Fit; compact: boolean }) {
  const base = 'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap';
  const approx = fit.best?.estimated ? '~' : '';
  switch (fit.status) {
    case 'good':
      return (
        <span className={`${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-400`} data-testid="fit-good">
          <Check className="h-3 w-3" />
          {compact ? 'Can run well' : `Can run well · up to ${fit.best?.label}`}
          {!compact && approx ? <span className="sr-only">(estimated)</span> : null}
        </span>
      );
    case 'tight':
      return (
        <span className={`${base} border-amber-700/60 bg-amber-500/10 text-amber-400`} data-testid="fit-tight">
          <AlertTriangle className="h-3 w-3" />
          {compact ? 'Barely fits' : `Barely fits · ${fit.best?.label}`}
        </span>
      );
    case 'no':
      return (
        <span className={`${base} border-red-800/60 bg-red-500/10 text-red-400`} data-testid="fit-no">
          <X className="h-3 w-3" />
          Too big to run
        </span>
      );
    case 'cloud':
      return (
        <span className={`${base} border-sky-800/60 bg-sky-500/10 text-sky-400`} data-testid="fit-cloud">
          <Cloud className="h-3 w-3" />
          Cloud
        </span>
      );
    default:
      return <span className="text-xs text-zinc-500" data-testid="fit-unknown">Size unknown</span>;
  }
}
