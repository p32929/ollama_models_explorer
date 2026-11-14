import { memo } from 'react';
import { Download, Clock, Brain, Image as ImageIcon, MessagesSquare, Code2, Sparkles } from 'lucide-react';
import type { ModelData } from '@/lib/types';
import type { Fit } from '@/lib/fit';
import { FitBadge } from './FitBadge';
import { SpeedBadge, speedOfFit } from './SpeedBadge';
import { Tip } from './Tip';
import { explainCapability, explainContext, explainDownloads, explainUpdated, type Machine } from '@/lib/explain';
import { speedTier, type SpeedTier } from '@/lib/speed';
import { daysSince } from '@/lib/units';
import { ownerOf, isNewModel, maxContextK } from '@/lib/filter';
import { specsOf, KIND_LABEL, type ModelKind } from '@/lib/specs';

const BAR: Record<SpeedTier, string> = { fast: 'bg-emerald-500', good: 'bg-lime-500', ok: 'bg-amber-500', slow: 'bg-red-500' };

const KIND_STYLE: Record<ModelKind, string> = {
  dense: 'border-zinc-700 bg-zinc-800/60 text-zinc-200',
  moe: 'border-violet-700/60 bg-violet-500/10 text-violet-300',
  mixed: 'border-violet-700/60 bg-violet-500/10 text-violet-300',
  unknown: 'border-zinc-800 text-zinc-500',
};
const KIND_HELP: Record<ModelKind, string[]> = {
  dense: ['A dense model uses all of itself to write every word. Speed depends on its full size.'],
  moe: ['A mixture-of-experts model is built from many small "experts" and only uses a few of them for each word, so it writes faster than its size suggests. It still needs memory for all of it.'],
  mixed: ['This model comes in both kinds: some sizes are dense (all of it is used for every word), others are mixture of experts (only a few experts are used for each word). Open it to see which is which.'],
  unknown: ['The kind of model is not known.'],
};

const capIcon = (c: string) => {
  const l = c.toLowerCase();
  if (l.includes('vision') || l.includes('image')) return <ImageIcon className="h-3 w-3" />;
  if (l.includes('chat')) return <MessagesSquare className="h-3 w-3" />;
  if (l.includes('code')) return <Code2 className="h-3 w-3" />;
  return <Sparkles className="h-3 w-3" />;
};

interface Props {
  model: ModelData;
  fit: Fit;
  machine?: Machine;
  selected: boolean;
  canSelect: boolean;
  onToggle: () => void;
  onOwner: (owner: string) => void;
  onOpen: () => void;
  relativeTime: (date: string) => string;
  /** Downloads gained since the last list update, shown in the Trending view */
  gained?: number;
}

/**
 * One model. The same layout on every screen: name and description on the left, "will it run and how fast" on the
 * right (under the text on a phone). Every row has the same height on a big screen, so lists never jump.
 */
function Spec({ label, tip, children }: { label: string; tip: { title: string; lines: string[] }; children: React.ReactNode }) {
  return (
    <Tip tip={tip}>
      <div className="min-w-0 md:flex md:items-baseline md:gap-3">
        <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 md:w-[4.25rem] md:shrink-0 md:text-[11px]">{label}</dt>
        <dd className="mt-0.5 min-w-0 md:mt-0 md:truncate">{children}</dd>
      </div>
    </Tip>
  );
}

function ModelRowBase({ model, fit, machine, selected, canSelect, onToggle, onOwner, onOpen, relativeTime, gained }: Props) {
  const owner = ownerOf(model);
  const shortName = owner ? model.name.slice(owner.length + 1) : model.name;
  const tps = speedOfFit(fit);
  const tier = tps > 0 ? speedTier(tps) : null;
  const fresh = isNewModel(model) && daysSince(model.firstSeen) <= 30;
  const ctx = maxContextK(model);
  const versions = model.versions.length || model.tagsCount || 0;
  const specs = specsOf(model);

  return (
    <article
      data-testid="model-row"
      data-name={model.name}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(); }}
      className={`group relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-2xl border p-3.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60 md:h-[8.5rem] md:grid-cols-[auto_minmax(0,1fr)_14.5rem_15rem] md:gap-x-5 md:overflow-hidden md:p-4 ${selected ? 'border-blue-500/70 bg-blue-500/5' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 hover:bg-zinc-900'}`}
    >
      {/* compare tick */}
      <Tip tip={{ title: 'Compare', lines: [!selected && !canSelect ? 'You can compare up to 4 models. Untick one first.' : 'Tick 2 to 4 models, then press Compare at the bottom to see them side by side.'] }}>
        <label onClick={e => e.stopPropagation()} className="-m-2.5 flex h-11 w-11 shrink-0 cursor-pointer items-start justify-center pt-3 md:-m-1 md:h-8 md:w-8 md:pt-1.5" aria-label={`Compare ${model.name}`}>
          <input type="checkbox" checked={selected} disabled={!selected && !canSelect} onChange={onToggle} data-testid="compare-check" className="h-[18px] w-[18px] cursor-pointer accent-blue-500" />
        </label>
      </Tip>

      {/* what it is */}
      <div className="min-w-0 md:flex md:flex-col">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="min-w-0 truncate text-base font-semibold text-white" data-testid="model-name">
            {owner && (
              <button onClick={e => { e.stopPropagation(); onOwner(owner); }} title={`Show everything by ${owner}`} className="font-normal text-zinc-500 hover:text-zinc-300">{owner}/</button>
            )}
            {shortName}
          </h3>
          {fresh && <Tip tip={{ title: 'New', lines: ['First seen on Ollama in the last 30 days.'] }}><span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-300">New</span></Tip>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-snug text-zinc-400">{model.description || 'No description.'}</p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-zinc-500 md:mt-auto md:flex-nowrap md:overflow-hidden">
          {model.capabilities.slice(0, 3).map(c => (
            <Tip key={c} tip={explainCapability(c)}>
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-1.5 py-0.5 capitalize text-zinc-300">{capIcon(c)}{c.toLowerCase()}</span>
            </Tip>
          ))}
          {model.pullsCount ? <Tip tip={explainDownloads(model)}><span className="inline-flex shrink-0 items-center gap-1"><Download className="h-3.5 w-3.5" />{model.pulls}</span></Tip> : null}
          {model.updated && <Tip tip={explainUpdated(model)}><span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap"><Clock className="h-3.5 w-3.5" />{relativeTime(model.updated)}</span></Tip>}
          {ctx > 0 && <Tip tip={explainContext(ctx)}><span className="hidden shrink-0 items-center gap-1 xl:inline-flex"><Brain className="h-3.5 w-3.5" />{ctx >= 1000 ? `${ctx / 1000}M` : `${ctx}K`}</span></Tip>}
        </div>
      </div>

      {/* how big it is and what kind it is */}
      <dl className="col-span-2 flex flex-wrap gap-x-7 gap-y-2 border-t border-zinc-800/70 pt-3 text-sm md:col-span-1 md:flex md:flex-col md:justify-center md:gap-2 md:border-l md:border-t-0 md:pl-5 md:pt-0">
        <Spec label="Size" tip={{ title: 'Size (parameters)', lines: [specs.params ? `Comes in ${specs.sizeCount} size${specs.sizeCount === 1 ? '' : 's'}, from ${specs.params.replace(' – ', ' to ')}. "B" means billions of parameters: more is usually smarter, but bigger and slower.` : 'The number of parameters is not known.'] }}>
          <span className="font-semibold text-white">{specs.params || '—'}</span>
        </Spec>
        <Spec label="Download" tip={{ title: 'Download size', lines: [specs.download ? `One recommended version per size, from ${specs.download.replace(' – ', ' to ')}.${versions ? ` ${versions} versions in total.` : ''}` : 'The download size is not known.'] }}>
          <span className="whitespace-nowrap text-zinc-200">{specs.download || '—'}</span>
        </Spec>
        <Spec label="Type" tip={{ title: KIND_LABEL[specs.kind], lines: [...KIND_HELP[specs.kind], specs.active ? `The biggest expert version uses ${specs.active.replace('~', 'about ').replace(' active', '')} for each word.` : ''].filter(Boolean) }}>
          {specs.kind === 'unknown' ? <span className="text-zinc-500">—</span> : <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium ${KIND_STYLE[specs.kind]}`}>{specs.kind === 'moe' ? 'MoE' : specs.kind === 'mixed' ? 'Dense + MoE' : KIND_LABEL[specs.kind]}</span>}
          {specs.kind === 'moe' && specs.active && <span className="ml-1.5 text-xs text-zinc-500">{specs.active}</span>}
        </Spec>
      </dl>

      {/* will it run, and how fast */}
      <div className="col-span-2 flex items-center gap-3 border-t border-zinc-800/70 pt-3 md:col-span-1 md:flex-col md:items-stretch md:justify-center md:gap-2 md:border-l md:border-t-0 md:pl-5 md:pt-0">
        <div className="shrink-0"><FitBadge fit={fit} machine={machine} /></div>
        <div className="min-w-0 flex-1 md:flex-none">
          {tps > 0 && tier ? (
            <>
              <div className="flex items-baseline justify-between gap-2" data-testid="speed-cell">
                <SpeedBadge tps={tps} fit={fit} machine={machine} />
                {gained ? <span className="text-xs text-emerald-400">+{gained.toLocaleString()}</span> : null}
              </div>
              <div className="mt-1.5 hidden h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 md:block" aria-hidden>
                <div className={`h-full rounded-full ${BAR[tier]}`} style={{ width: `${Math.max(6, Math.min(100, (tps / 80) * 100))}%` }} />
              </div>
            </>
          ) : (
            <div data-testid="speed-cell"><SpeedBadge tps={0} fit={fit} machine={machine} /></div>
          )}
        </div>
      </div>
    </article>
  );
}

export const ModelRow = memo(ModelRowBase);
