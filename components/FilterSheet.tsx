import { useEffect } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_FILTERS, type Filters, activeFilterCount } from '@/lib/filter';

interface Props {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onClose: () => void;
  resultCount: number;
  hiddenDuplicates: number;
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <fieldset className="py-3 border-b border-zinc-800 last:border-0">
    <legend className="mb-2 text-sm font-medium text-zinc-200">{title}</legend>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </fieldset>
);

const Chip = ({ active, onClick, children, testid }: { active: boolean; onClick: () => void; children: React.ReactNode; testid?: string }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    data-testid={testid}
    className={`h-9 rounded-full border px-3.5 text-sm transition-colors ${active ? 'border-white bg-white text-black' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
  >
    {children}
  </button>
);

/** Extra filters. A bottom sheet on phones, a side panel on larger screens. */
export function FilterSheet({ filters, onChange, onClose, resultCount, hiddenDuplicates }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const active = activeFilterCount(filters);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-black/60" onClick={onClose} data-testid="filter-sheet">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        onClick={e => e.stopPropagation()}
        className="flex max-h-[88vh] w-full flex-col rounded-t-2xl border border-zinc-800 bg-zinc-950 sm:max-h-none sm:max-w-sm sm:rounded-none sm:border-y-0 sm:border-r-0"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">Filters {active > 0 && <span className="text-zinc-500 font-normal">({active})</span>}</h2>
          <button onClick={onClose} aria-label="Close filters" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-300"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          <Group title="Updated">
            {[[0, 'Any time'], [7, 'Last week'], [30, 'Last month'], [90, '3 months'], [365, 'Last year']].map(([d, label]) => (
              <Chip key={d} active={filters.updatedDays === d} onClick={() => onChange({ updatedDays: d as number })} testid={`upd-${d}`}>{label}</Chip>
            ))}
          </Group>
          <Group title="Size (smallest version)">
            {[[0, 'Any'], [2, 'Under 2 GB'], [4, 'Under 4 GB'], [8, 'Under 8 GB'], [16, 'Under 16 GB'], [32, 'Under 32 GB']].map(([g, label]) => (
              <Chip key={g} active={filters.maxGB === g} onClick={() => onChange({ maxGB: g as number })} testid={`max-${g}`}>{label}</Chip>
            ))}
          </Group>
          <Group title="Context window (official models)">
            {[[0, 'Any'], [8, '8K+'], [32, '32K+'], [128, '128K+'], [256, '256K+']].map(([k, label]) => (
              <Chip key={k} active={filters.minContextK === k} onClick={() => onChange({ minContextK: k as number })} testid={`ctx-${k}`}>{label}</Chip>
            ))}
          </Group>
          <Group title="Speed on your computer">
            {[[0, 'Any'], [10, '10+ tokens/s'], [20, '20+ tokens/s'], [40, '40+ tokens/s']].map(([t, label]) => (
              <Chip key={t} active={filters.minTps === t} onClick={() => onChange({ minTps: t as number })} testid={`tps-${t}`}>{label}</Chip>
            ))}
            <p className="w-full text-xs text-zinc-500">A token is about three quarters of a word. 20 tokens/s is faster than most people read.</p>
          </Group>
          <Group title="Duplicates">
            <Chip active={filters.dedupe} onClick={() => onChange({ dedupe: !filters.dedupe })} testid="dedupe">
              Hide near-duplicates
            </Chip>
            {filters.dedupe && <p className="w-full text-xs text-zinc-500">{hiddenDuplicates.toLocaleString()} community copies hidden: same description as a more popular model.</p>}
          </Group>
          {filters.owner && (
            <Group title="Publisher">
              <Chip active onClick={() => onChange({ owner: '' })}>{filters.owner} ✕</Chip>
            </Group>
          )}
        </div>
        <div className="flex gap-2 border-t border-zinc-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => onChange({ updatedDays: 0, maxGB: 0, minContextK: 0, dedupe: false, owner: '', caps: [], tasks: [], fitOnly: false, minTps: 0 })}
            className="h-11 flex-1 rounded-lg border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-900"
            disabled={active === 0}
          >
            Clear all
          </button>
          <button onClick={onClose} className="h-11 flex-[2] rounded-lg bg-white text-sm font-semibold text-black" data-testid="show-results">
            Show {resultCount.toLocaleString()} models
          </button>
        </div>
      </div>
    </div>
  );
}
export { DEFAULT_FILTERS };
