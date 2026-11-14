import { ExternalLink, Clock, Download, Tag } from 'lucide-react';
import type { ModelData } from '@/lib/types';
import type { Fit } from '@/lib/fit';
import { FitBadge } from './FitBadge';
import { SpeedBadge, speedOfFit } from './SpeedBadge';
import { daysSince } from '@/lib/units';
import { ownerOf, sizeSummary, isNewModel } from '@/lib/filter';

interface Props {
  model: ModelData;
  fit: Fit;
  selected: boolean;
  canSelect: boolean;
  onToggle: () => void;
  onOwner: (owner: string) => void;
  onOpen: () => void;
  relativeTime: (date: string) => string;
}

/** One model as a card: the layout used on phones and small tablets. */
export function ModelCard({ model, fit, selected, canSelect, onToggle, onOwner, onOpen, relativeTime }: Props) {
  const owner = ownerOf(model);
  const shortName = owner ? model.name.slice(owner.length + 1) : model.name;
  const fresh = isNewModel(model) && daysSince(model.firstSeen) <= 30;
  return (
    <article
      data-testid="model-card"
      data-name={model.name}
      onClick={onOpen}
      className={`cursor-pointer rounded-xl border p-3.5 transition-colors active:bg-zinc-800 ${selected ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-800 bg-zinc-900'}`}
    >
      <div className="flex items-start gap-1.5">
        <label onClick={e => e.stopPropagation()} className="-m-2.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center" aria-label={`Compare ${model.name}`}>
          <input
            type="checkbox"
            checked={selected}
            disabled={!selected && !canSelect}
            onChange={onToggle}
            data-testid="compare-check"
            className="h-5 w-5 accent-blue-500"
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 break-words text-[15px] font-semibold leading-snug text-white" data-testid="model-name">
              {owner && (
                <button onClick={e => { e.stopPropagation(); onOwner(owner); }} className="text-zinc-500 hover:text-zinc-300 font-normal">{owner}/</button>
              )}
              {shortName}
              {fresh && <span className="ml-2 align-middle rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-300">New</span>}
            </h3>
            <a
              href={model.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              aria-label={`Open ${model.name} on ollama.com`}
              className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          {model.description && <p className="mt-1 line-clamp-2 text-sm leading-snug text-zinc-400">{model.description}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <FitBadge fit={fit} />
            {speedOfFit(fit) > 0 && <SpeedBadge tps={speedOfFit(fit)} compact />}
            {model.capabilities.filter(c => !(fit.status === 'cloud' && c.toLowerCase() === 'cloud')).slice(0, 3).map(c => (
              <span key={c} className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs capitalize text-zinc-200">{c.toLowerCase()}</span>
            ))}
            {model.capabilities.length > 3 && <span className="text-xs text-zinc-500">+{model.capabilities.length - 3}</span>}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{sizeSummary(model)}</span>
            {model.pulls && <span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" />{model.pulls}</span>}
            {model.updated && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{relativeTime(model.updated)}</span>}
          </div>
        </div>
      </div>
    </article>
  );
}
