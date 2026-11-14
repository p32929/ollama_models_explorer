import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { ModelData } from '@/lib/types';
import type { Fit } from '@/lib/fit';
import { FitBadge } from './FitBadge';
import { ownerOf, sizeSummary, maxContextK } from '@/lib/filter';
import { formatCount } from '@/lib/units';

interface Props {
  models: ModelData[];
  fitOf: (m: ModelData) => Fit;
  deviceLabel: string;
  relativeTime: (date: string) => string;
  onRemove: (name: string) => void;
  onClose: () => void;
}

/** Up to four models side by side. Full screen on a phone. */
export function CompareDialog({ models, fitOf, deviceLabel, relativeTime, onRemove, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const best = (values: number[]) => (values.length > 1 ? Math.max(...values) : -1);
  const topDownloads = best(models.map(m => m.pullsCount || 0));
  const topContext = best(models.map(maxContextK));

  const rows: { label: string; cell: (m: ModelData) => React.ReactNode }[] = [
    { label: 'Publisher', cell: m => ownerOf(m) || 'Official (Ollama)' },
    { label: 'About', cell: m => <span className="line-clamp-5 text-zinc-300">{m.description || '—'}</span> },
    { label: 'Capabilities', cell: m => (m.capabilities.length ? <span className="capitalize">{m.capabilities.join(', ').toLowerCase()}</span> : '—') },
    { label: `On ${deviceLabel}`, cell: m => <FitBadge fit={fitOf(m)} /> },
    { label: 'Sizes', cell: m => sizeSummary(m) },
    { label: 'Context window', cell: m => { const c = maxContextK(m); return c ? <span className={c === topContext ? 'text-emerald-400 font-medium' : ''}>{c >= 1000 ? `${c / 1000}M` : `${c}K`}</span> : <span className="text-zinc-500">not listed</span>; } },
    { label: 'Downloads', cell: m => <span className={(m.pullsCount || 0) === topDownloads && topDownloads > 0 ? 'text-emerald-400 font-medium' : ''}>{m.pullsCount ? formatCount(m.pullsCount) : '—'}</span> },
    { label: 'Versions', cell: m => m.versions.length || m.tagsCount || '—' },
    { label: 'Updated', cell: m => (m.updated ? relativeTime(m.updated) : '—') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={onClose} data-testid="compare-dialog">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compare models"
        onClick={e => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-zinc-950 sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-zinc-800"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <h2 className="text-base font-semibold text-white">Compare {models.length} models</h2>
          <button onClick={onClose} aria-label="Close comparison" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-300">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-zinc-950">
                <th className="sticky left-0 z-20 w-20 min-w-20 bg-zinc-950 px-2 py-3 sm:w-28 sm:px-3" />
                {models.map(m => (
                  <th key={m.name} className="min-w-40 max-w-64 px-2 py-3 text-left align-top font-semibold text-white sm:min-w-52 sm:px-3" data-testid="compare-col">
                    <div className="flex items-start justify-between gap-2">
                      <span className="break-words">{m.name}</span>
                      <button onClick={() => onRemove(m.name)} aria-label={`Remove ${m.name} from the comparison`} className="shrink-0 rounded-full p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-blue-400 hover:underline">
                      Open on ollama.com <ExternalLink className="h-3 w-3" />
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} className="border-t border-zinc-800 align-top">
                  <th className="sticky left-0 z-10 w-20 min-w-20 bg-zinc-950 px-2 py-3 text-left text-[11px] font-medium text-zinc-400 sm:w-28 sm:px-3 sm:text-xs">{r.label}</th>
                  {models.map(m => <td key={m.name} className="max-w-[11rem] break-words px-2 py-3 text-[13px] text-zinc-100 sm:max-w-[16rem] sm:px-3 sm:text-sm">{r.cell(m)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
