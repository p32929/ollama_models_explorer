import { useState } from 'react';
import { Cpu, Check, RefreshCw, X } from 'lucide-react';
import { DEVICE_PRESETS, type Device } from '@/lib/device';
import { TASKS } from '@/lib/tasks';
import { DEFAULT_FILTERS, activeFilterCount, type Filters, type Scope } from '@/lib/filter';
import type { Machine } from '@/lib/explain';
import { Tip } from './Tip';

export interface Glance { runs: number; fast: number; fresh: number }

interface Props {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  device: Device | null;
  onDevice: (d: Device | null) => void;
  machine?: Machine;
  glance: Glance;
  counts: { all: number; official: number; community: number };
  capabilities: [string, number][];
}

const Section = ({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) => (
  <section className="border-t border-zinc-800/70 pt-4" aria-label={title}>
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
      {hint && <span className="text-[11px] text-zinc-600">{hint}</span>}
    </div>
    {children}
  </section>
);

/** A tick box or round radio: one whole row is the click target. */
function Choice({ on, onClick, label, hint, count, multi, testid }: { on: boolean; onClick: () => void; label: string; hint?: string; count?: number; multi?: boolean; testid: string }) {
  const body = (
    <button
      onClick={onClick}
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={on}
      data-testid={testid}
      className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-900 ${on ? 'text-white' : 'text-zinc-300'}`}
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center border transition-colors ${multi ? 'rounded' : 'rounded-full'} ${on ? 'border-white bg-white text-black' : 'border-zinc-600'}`}>
        {on && (multi ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-black" />)}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-zinc-600">{count.toLocaleString()}</span>}
    </button>
  );
  return hint ? <Tip block tip={{ title: label, lines: [hint] }}>{body}</Tip> : body;
}

const Pill = ({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: React.ReactNode; testid: string }) => (
  <button
    onClick={onClick}
    aria-pressed={on}
    data-testid={testid}
    className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${on ? 'border-white bg-white text-black' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white'}`}
  >
    {children}
  </button>
);

/** Your computer, as a card: what we found, a way to correct it, and what it can run. */
function DeviceCard({ device, onDevice, machine, filters, onChange, glance }: Pick<Props, 'device' | 'onDevice' | 'machine' | 'filters' | 'onChange' | 'glance'>) {
  const [open, setOpen] = useState(false);
  if (!device) return <div className="h-40 animate-pulse rounded-xl bg-zinc-900/50" />;
  const how = device.manual ? 'You chose this.' : device.confidence === 'detected' ? 'Read from your browser.' : device.confidence === 'estimated' ? 'Estimated from your hardware.' : 'A guess: pick the closest below.';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5" data-testid="device-bar">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300"><Cpu className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Your computer</div>
          <Tip block tip={{ title: 'Your computer', lines: [`${how} About ${device.memoryGB} GB of usable memory, reading it at about ${device.bandwidthGBs} GB/s. That decides which models fit and how fast they write.`] }}>
            <div className="truncate text-[15px] font-medium text-white" data-testid="device-label">{device.label}</div>
          </Tip>
          <div className="text-xs text-zinc-500">~{device.memoryGB} GB usable · {device.bandwidthGBs} GB/s</div>
        </div>
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="device-chip" className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800">{open ? 'Done' : 'Change'}</button>
      </div>

      {open && (
        <div className="mt-3 border-t border-zinc-800 pt-3" role="group" aria-label="Choose your computer">
          <p className="mb-2 text-xs text-zinc-400">{how} Browsers hide exact memory, so if it looks wrong, pick the closest:</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DEVICE_PRESETS.map(p => {
              const selected = device.manual && device.memoryGB === p.memoryGB && device.label === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => { onDevice({ label: p.label, memoryGB: p.memoryGB, bandwidthGBs: p.bandwidthGBs, kind: p.kind, confidence: 'detected', manual: true }); setOpen(false); }}
                  className={`flex items-center justify-between gap-1 rounded-md border px-2 py-2 text-left text-xs transition-colors ${selected ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
                >
                  <span>{p.label}</span>{selected && <Check className="h-3 w-3 text-blue-400" />}
                </button>
              );
            })}
          </div>
          <button onClick={() => { onDevice(null); setOpen(false); }} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
            <RefreshCw className="h-3 w-3" /> Detect again automatically
          </button>
        </div>
      )}

      <div className="mt-3 space-y-1 border-t border-zinc-800 pt-3 text-sm">
        <Tip block tip={{ title: 'Fits your computer', lines: [`Models with a version that fits in ${machine ? `about ${machine.memoryGB} GB of memory on ${machine.label}` : 'your memory'}. Click to show only these.`] }}>
          <button onClick={() => onChange({ fitOnly: !filters.fitOnly })} className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-zinc-300 hover:bg-zinc-900" data-testid="glance-runs">
            <span><span className="font-semibold tabular-nums text-emerald-400">{glance.runs.toLocaleString()}</span> can run on {device.manual ? 'your' : 'this'} computer</span>
          </button>
        </Tip>
        <Tip block tip={{ title: 'Fast ones', lines: ['Models that should make at least 40 tokens per second here: much faster than you can read. Click to show only these.'] }}>
          <button onClick={() => onChange({ minTps: filters.minTps === 40 ? 0 : 40, fitOnly: false })} className="flex w-full items-center rounded-md px-1 py-1 text-left text-zinc-300 hover:bg-zinc-900" data-testid="glance-fast">
            <span><span className="font-semibold tabular-nums text-lime-400">{glance.fast.toLocaleString()}</span> can make 40+ tokens per second</span>
          </button>
        </Tip>
        <Tip block tip={{ title: 'New or updated', lines: ['Added to Ollama in the last 30 days, or changed in the last 2 weeks. Click to see them.'] }}>
          <button onClick={() => onChange({ view: 'new' })} className="flex w-full items-center rounded-md px-1 py-1 text-left text-zinc-300 hover:bg-zinc-900" data-testid="glance-new">
            <span><span className="font-semibold tabular-nums text-blue-400">{glance.fresh.toLocaleString()}</span> new or updated recently</span>
          </button>
        </Tip>
      </div>
      <Tip block tip={{ title: 'Only what can run', lines: ['Hide every model that is too big for your computer, or has no known size.'] }}>
        <label className="mt-3 flex cursor-pointer select-none items-center gap-2.5 rounded-lg border border-zinc-700 px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-900 has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-500/5 has-[:checked]:text-emerald-300">
          <input type="checkbox" checked={filters.fitOnly} onChange={e => onChange({ fitOnly: e.target.checked })} className="h-4 w-4 accent-emerald-500" data-testid="fit-only" />
          Only show models that can run on it
        </label>
      </Tip>
    </div>
  );
}

/** All the ways to narrow the list, always visible. The sidebar on a big screen, a sheet on a phone. */
export function FilterPanel(props: Props) {
  const { filters, onChange, counts, capabilities } = props;
  const active = activeFilterCount(filters);
  const nums = (key: 'updatedDays' | 'maxGB' | 'minContextK' | 'minTps', items: [number, string][], prefix: string) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([v, label]) => <Pill key={v} on={filters[key] === v} onClick={() => onChange({ [key]: v })} testid={`${prefix}-${v}`}>{label}</Pill>)}
    </div>
  );
  return (
    <aside data-testid="filter-panel" aria-label="Filters" className="space-y-5">
      <DeviceCard {...props} />

      <Section title="Show">
        {([['all', 'All models', counts.all, 'Every model on ollama.com: official and community.'], ['official', 'Official', counts.official, "Made or curated by Ollama's team, with every version listed."], ['community', 'Community', counts.community, 'Uploaded by other people, named user/model. Often fine-tunes of the official ones.']] as [Scope, string, number, string][]).map(([v, label, n, hint]) => (
          <Choice key={v} on={filters.scope === v} onClick={() => onChange({ scope: v })} label={label} count={n} hint={hint} testid={`scope-${v}`} />
        ))}
      </Section>

      <Section title="I want to" hint="match all">
        {TASKS.map(t => (
          <Choice key={t.id} multi on={filters.tasks.includes(t.id)} onClick={() => onChange({ tasks: filters.tasks.includes(t.id) ? filters.tasks.filter(x => x !== t.id) : [...filters.tasks, t.id] })} label={t.label} hint={t.hint} testid={`tasks-${t.id}`} />
        ))}
      </Section>

      <Section title="Capabilities" hint="match all">
        {capabilities.map(([c, n]) => (
          <Choice key={c} multi on={filters.caps.includes(c)} onClick={() => onChange({ caps: filters.caps.includes(c) ? filters.caps.filter(x => x !== c) : [...filters.caps, c] })} label={c.charAt(0).toUpperCase() + c.slice(1)} count={n} testid={`caps-${c}`} />
        ))}
      </Section>

      <Section title="Speed on your computer">
        {nums('minTps', [[0, 'Any'], [10, '10+'], [20, '20+'], [40, '40+']], 'tps')}
        <p className="mt-2 text-xs text-zinc-600">Tokens per second. 20+ is faster than most people read.</p>
      </Section>

      <Section title="Updated">
        {nums('updatedDays', [[0, 'Any time'], [7, 'Week'], [30, 'Month'], [90, '3 months'], [365, 'Year']], 'upd')}
      </Section>

      <Section title="Size" hint="smallest version">
        {nums('maxGB', [[0, 'Any'], [2, '< 2 GB'], [4, '< 4 GB'], [8, '< 8 GB'], [16, '< 16 GB'], [32, '< 32 GB']], 'max')}
      </Section>

      <Section title="Context window" hint="official only">
        {nums('minContextK', [[0, 'Any'], [8, '8K+'], [32, '32K+'], [128, '128K+'], [256, '256K+']], 'ctx')}
      </Section>

      <Section title="Options">
        <Choice multi on={filters.dedupe} onClick={() => onChange({ dedupe: !filters.dedupe })} label="Hide near-duplicates" hint="Hide community copies that have the same description as a more popular model." testid="dedupe" />
        {filters.owner && (
          <button onClick={() => onChange({ owner: '' })} className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-zinc-800 pl-3 pr-2 text-xs text-zinc-100 hover:bg-zinc-700">
            By {filters.owner}<X className="h-3.5 w-3.5 text-zinc-400" />
          </button>
        )}
      </Section>

      <button
        onClick={() => onChange({ ...DEFAULT_FILTERS, q: filters.q, view: filters.view, sort: filters.sort, dir: filters.dir })}
        disabled={active === 0 && filters.scope === 'all'}
        className="h-10 w-full rounded-lg border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
      >
        Clear all filters
      </button>
    </aside>
  );
}
