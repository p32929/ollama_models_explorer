import { useEffect, useMemo, useState } from 'react';
import { X, ExternalLink, Copy, Check, Download, Clock, Tag, Brain, Loader2, GitCompare, Info } from 'lucide-react';
import type { ModelData, ModelVersion } from '@/lib/types';
import { fitOf, variantsOf, variantTps, representatives } from '@/lib/fit';
import { FitBadge } from './FitBadge';
import { SpeedBadge } from './SpeedBadge';
import { describeSpeed, formatTps, speedTier, TIER_LABEL } from '@/lib/speed';
import { formatCount, formatGB } from '@/lib/units';
import { ownerOf, maxContextK } from '@/lib/filter';
import type { Device } from '@/lib/device';
import { explainCapability, type Machine } from '@/lib/explain';
import { Tip } from './Tip';

interface Props {
  model: ModelData;
  device: Device | null;
  loadVersions: (model: ModelData) => Promise<ModelVersion[]>;
  relativeTime: (date: string) => string;
  onClose: () => void;
  onOwner: (owner: string) => void;
  compareSelected: boolean;
  canCompare: boolean;
  onToggleCompare: () => void;
}

function CopyButton({ text, label, testid }: { text: string; label: string; testid?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // older browsers and plain http: fall back to a hidden text box
      const box = document.createElement('textarea');
      box.value = text;
      document.body.append(box);
      box.select();
      document.execCommand('copy');
      box.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <button onClick={copy} aria-label={label} data-testid={testid} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:bg-zinc-800">
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Everything about one model: will it run here, how fast, how to install it, and every version. */
export function ModelDrawer({ model, device, loadVersions, relativeTime, onClose, onOwner, compareSelected, canCompare, onToggleCompare }: Props) {
  const [loaded, setLoaded] = useState<ModelVersion[] | null>(model.versions.length ? model.versions : null);
  const [loading, setLoading] = useState(!model.versions.length);

  useEffect(() => {
    let live = true;
    if (model.versions.length) { setLoaded(model.versions); setLoading(false); return; }
    setLoading(true);
    loadVersions(model).then(v => { if (live) { setLoaded(v); setLoading(false); } });
    return () => { live = false; };
  }, [model.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const withVersions = useMemo(() => ({ ...model, versions: loaded || model.versions }), [model, loaded]);
  const memory = device?.memoryGB ?? 10;
  const bandwidth = device?.bandwidthGBs ?? 0;
  const fit = useMemo(() => fitOf(withVersions, memory, bandwidth), [withVersions, memory, bandwidth]);
  const machine: Machine | undefined = device ? { label: device.label, memoryGB: device.memoryGB, bandwidthGBs: device.bandwidthGBs } : undefined;
  const allVariants = useMemo(() => variantsOf(withVersions), [withVersions]);
  const recommended = useMemo(() => representatives(allVariants), [allVariants]);
  const [showAll, setShowAll] = useState(false);
  const variants = showAll ? allVariants : recommended;
  const pending = loading && !model.versions.length; // the real list of versions is on its way
  const owner = ownerOf(model);
  const ctx = maxContextK(withVersions);
  const exact = Boolean(loaded?.length);
  const runName = (tag?: string) => `ollama run ${model.name}${tag ? `:${tag}` : ''}`;
  // the exact version to suggest: the full tag of the biggest one that runs well
  const bestTag = fit.best && exact ? fit.best.tag : undefined;
  const tier = fit.tps > 0 ? speedTier(fit.tps) : null;
  const noSpeed = !fit.tps && (fit.status === 'good' || fit.status === 'tight') && (model.capabilities.some(c => c.toLowerCase() === 'embedding') || /embed/i.test(model.name));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose} data-testid="model-drawer-backdrop">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${model.name} details`}
        data-testid="model-drawer"
        onClick={e => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-zinc-950 sm:max-w-xl sm:border-l sm:border-zinc-800"
      >
        <div className="relative flex items-start gap-3 border-b border-zinc-800 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {loading && <div className="shimmer absolute inset-x-0 bottom-[-1px] h-0.5" data-testid="drawer-loading-bar" />}
          <div className="min-w-0 flex-1">
            {owner && <button onClick={() => { onOwner(owner); onClose(); }} className="text-xs text-zinc-500 hover:text-zinc-300">by {owner}</button>}
            <h2 className="break-words text-lg font-semibold text-white" data-testid="drawer-title">{owner ? model.name.slice(owner.length + 1) : model.name}</h2>
          </div>
          <a href={model.url} target="_blank" rel="noopener noreferrer" aria-label="Open on ollama.com" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800"><ExternalLink className="h-4 w-4" /></a>
          <button onClick={onClose} aria-label="Close details" data-testid="drawer-close" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* On your computer */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4" data-testid="drawer-fit">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">On {device?.label || 'your computer'}</div>
            {pending ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading"><div className="shimmer h-7 w-48 rounded-md" /><div className="shimmer h-4 w-3/4 rounded" /></div>
            ) : (<>
            <div className="flex flex-wrap items-center gap-3">
              <FitBadge fit={fit} machine={machine} />
              {fit.tps > 0 && <SpeedBadge tps={fit.tps} showTier fit={fit} machine={machine} />}
            </div>
            {fit.tps > 0 && tier && (
              <p className="mt-2 text-sm text-zinc-300" data-testid="drawer-speed-text">
                Writes {describeSpeed(fit.tps)}. That is the {fit.best?.label} version{fit.best?.estimated ? ' (size estimated)' : ''}.
              </p>
            )}
            {noSpeed && <p className="mt-2 text-sm text-zinc-400">This model turns text into numbers for search instead of writing words, so tokens per second does not apply.</p>}
            {fit.status === 'no' && <p className="mt-2 text-sm text-zinc-400">Even the smallest version ({fit.smallest?.label}, about {formatGB(fit.smallest?.sizeGB || 0)}) needs more memory than this computer can spare.</p>}
            {fit.status === 'cloud' && <p className="mt-2 text-sm text-zinc-400">This model runs on Ollama&apos;s servers, so your computer&apos;s memory does not matter.</p>}
            {fit.status === 'unknown' && !loading && <p className="mt-2 text-sm text-zinc-400">No size is listed for this model, so we cannot tell.</p>}
            {fit.status === 'tight' && <p className="mt-2 text-sm text-zinc-400">It fits, but with little memory to spare, so long chats may slow down.</p>}
            </>)}
          </section>

          {/* Install */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-zinc-200">Install it</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black p-2 pl-3">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-zinc-100" data-testid="run-command">{runName()}</code>
                <CopyButton text={runName()} label="Copy the install command" testid="copy-run" />
              </div>
              {pending && <div className="shimmer h-14 rounded-lg" aria-hidden />}
              {bestTag && !/^latest$/i.test(bestTag) && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-500/5 p-2 pl-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-400">Best for your computer</div>
                    <code className="block overflow-x-auto whitespace-nowrap font-mono text-sm text-zinc-100" data-testid="run-command-best">{runName(bestTag)}</code>
                  </div>
                  <CopyButton text={runName(bestTag)} label="Copy the command for the best version" testid="copy-run-best" />
                </div>
              )}
            </div>
          </section>

          {/* About */}
          <section>
            {model.description && <p className="text-sm leading-relaxed text-zinc-300">{model.description}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {[
                [<Download key="d" className="h-3.5 w-3.5" />, 'Downloads', model.pullsCount ? formatCount(model.pullsCount) : '—'],
                [<Clock key="u" className="h-3.5 w-3.5" />, 'Updated', model.updated ? relativeTime(model.updated) : '—'],
                [<Tag key="v" className="h-3.5 w-3.5" />, 'Versions', String(loaded?.length || model.tagsCount || '—')],
                [<Brain key="c" className="h-3.5 w-3.5" />, 'Context window', ctx ? (ctx >= 1000 ? `${ctx / 1000}M` : `${ctx}K`) : 'not listed'],
              ].map(([icon, label, value]) => (
                <div key={String(label)} className="rounded-lg bg-zinc-900 px-3 py-2">
                  <dt className="flex items-center gap-1.5 text-xs text-zinc-500">{icon}{label}</dt>
                  <dd className="mt-0.5 text-zinc-100">{value}</dd>
                </div>
              ))}
            </dl>
            {model.capabilities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {model.capabilities.map(c => <Tip key={c} tip={explainCapability(c)}><span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs capitalize text-zinc-200">{c.toLowerCase()}</span></Tip>)}
              </div>
            )}
          </section>

          {/* Versions */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-200">{showAll ? 'All versions' : 'One version per size'}, with speed on your computer</h3>
              {loading && <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading all versions…</span>}
            </div>
            {pending && (
              <div className="space-y-2" aria-busy="true" aria-label="Loading versions" data-testid="versions-loading">
                {[0, 1, 2, 3].map(i => <div key={i} className="shimmer h-11 rounded-lg" />)}
              </div>
            )}
            {variants.length === 0 && !loading && <p className="text-sm text-zinc-500">The list of versions could not be loaded. <a className="text-blue-400 underline" href={`${model.url}/tags`} target="_blank" rel="noopener noreferrer">See them on ollama.com</a>.</p>}
            {variants.length > 0 && !pending && (
              <div className="overflow-hidden rounded-lg border border-zinc-800" data-testid="variants">
                <div className="grid grid-cols-[minmax(0,1.3fr)_0.8fr_1fr_auto] items-center gap-x-3 border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  <span>Version</span><span>Size</span><span>Speed</span><span className="sr-only">Copy</span>
                </div>
                {variants.map(v => {
                  const tps = fit.status === 'cloud' ? 0 : variantTps(v, bandwidth);
                  const need = v.sizeGB * 1.15 + 0.5;
                  const status = need <= memory * 0.9 ? 'good' : need <= memory ? 'tight' : 'no';
                  const isBest = fit.best?.tag === v.tag;
                  return (
                    <div key={v.tag} data-testid="variant-row" data-status={status} className={`grid grid-cols-[minmax(0,1.3fr)_0.8fr_1fr_auto] items-center gap-x-3 border-b border-zinc-900 px-3 py-2.5 text-sm last:border-0 ${isBest ? 'bg-emerald-500/5' : ''}`}>
                      <span className="min-w-0 break-words font-mono text-[13px] text-zinc-100">{v.tag}{isBest && <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase text-emerald-300">Best</span>}</span>
                      <span className="tabular-nums text-zinc-300">{v.estimated ? '~' : ''}{formatGB(v.sizeGB)}</span>
                      <span>
                        {status === 'no' && fit.status !== 'cloud' ? <span className="text-xs text-red-400">Too big to run</span> : tps > 0 ? <SpeedBadge tps={tps} compact fit={fit} machine={machine} /> : <span className="text-zinc-600">—</span>}
                        {status === 'tight' && tps > 0 && <span className="ml-1 text-[10px] text-amber-400">tight</span>}
                      </span>
                      <CopyButton text={exact ? `ollama run ${loaded?.find(x => x.name.endsWith(`:${v.tag}`))?.name || `${model.name}:${v.tag}`}` : runName(v.tag)} label={`Copy the command for ${v.tag}`} />
                    </div>
                  );
                })}
              </div>
            )}
            {allVariants.length > recommended.length && (
              <button onClick={() => setShowAll(a => !a)} data-testid="show-all-versions" className="mt-2 text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2">
                {showAll ? 'Show one per size' : `Show all ${allVariants.length} versions (other builds of the same sizes)`}
              </button>
            )}
            {!exact && variants.length > 0 && !loading && <p className="mt-2 text-xs text-zinc-500">Sizes are estimated from the parameter count.</p>}
          </section>

          <details className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-400">
            <summary className="flex cursor-pointer items-center gap-2 text-zinc-300"><Info className="h-4 w-4" />How is the speed estimated?</summary>
            <div className="mt-2 space-y-2 leading-relaxed">
              <p>To write each word, a model reads all of itself from memory once. So its speed is about <em>memory speed ÷ model size</em>. {device ? `${device.label} reads memory at roughly ${device.bandwidthGBs} GB/s.` : ''}</p>
              <p>Real programs reach about two thirds of that. Models that only use part of themselves for each word (&quot;mixture of experts&quot;) are faster than their size suggests. Treat the number as a guide, within about ±30%: the program, context length and settings all change it.</p>
              <p>These estimates are for writing the answer. Reading a very long prompt first takes extra time.</p>
            </div>
          </details>
        </div>

        <div className="flex gap-2 border-t border-zinc-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onToggleCompare} disabled={!compareSelected && !canCompare} data-testid="drawer-compare" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-700 text-sm text-zinc-100 hover:bg-zinc-900 disabled:opacity-50">
            <GitCompare className="h-4 w-4" />{compareSelected ? 'Remove from compare' : 'Add to compare'}
          </button>
          <a href={model.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-black hover:bg-zinc-200">
            Open on ollama.com <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </aside>
    </div>
  );
}
