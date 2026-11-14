import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Head from 'next/head';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModelRow } from '@/components/ModelRow';
import { FilterPanel } from '@/components/FilterPanel';
import { CompareDialog } from '@/components/CompareDialog';
import { ModelDrawer } from '@/components/ModelDrawer';
import { Tip } from '@/components/Tip';
import { type Machine } from '@/lib/explain';
import { Search, Github, RefreshCw, Sun, Moon, Star, X, SlidersHorizontal, GitCompare, Braces, Rss, Sparkles, Flame } from 'lucide-react';

import { ModelData, ModelVersion, ScrapingLog } from '@/lib/types';
import { scrapeOllamaModels, searchOllama, fetchModelDetails } from '@/lib/clientScraper';
import { loadCatalogue } from '@/lib/catalogue';
import { detectDevice, type Device } from '@/lib/device';
import { fitOf, type Fit } from '@/lib/fit';
import { TASKS } from '@/lib/tasks';
import { daysSince } from '@/lib/units';
import {
  applyFilters, activeFilterCount, DEFAULT_FILTERS, hasGrowthData, heatOf, isNewModel, isCommunity, ownerOf, sizeSummary, maxContextK,
  type Filters, type SortField, type View, type Scope,
} from '@/lib/filter';
import { filtersToQuery, queryToFilters } from '@/lib/urlState';

const PAGE_SIZE = 150; // rows drawn at a time: the full catalogue is tens of thousands of models
const MAX_COMPARE = 4;
const DEVICE_KEY = 'ome.device';
const THEME_KEY = 'ome.theme';

function relativeTime(dateString: string): string {
  if (!dateString) return 'N/A';
  const days = daysSince(dateString);
  if (!Number.isFinite(days)) return 'N/A';
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return ago(Math.floor(days / 7), 'week');
  if (days < 365) return ago(Math.floor(days / 30), 'month');
  return ago(Math.floor(days / 365), 'year');
}

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return match;
}

const VIEWS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'browse', label: 'Browse', icon: <Search className="h-3.5 w-3.5" /> },
  { id: 'new', label: "What's new", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'trending', label: 'Trending', icon: <Flame className="h-3.5 w-3.5" /> },
];

const SCOPE_HELP: Record<Scope, { title: string; lines: string[] }> = {
  all: { title: 'All models', lines: ['Every model on ollama.com: official and community.'] },
  official: { title: 'Official', lines: ["Made or curated by Ollama's team. About 270 models, with every version listed."] },
  community: { title: 'Community', lines: ['Uploaded by other people, named user/model. Often fine-tunes or variations of the official ones.'] },
};
const VIEW_HELP: Record<View, { title: string; lines: string[] }> = {
  browse: { title: 'Browse', lines: ['Everything, most downloaded first.'] },
  new: { title: "What's new", lines: ['Models added in the last 30 days or updated in the last 2 weeks, newest first.'] },
  trending: { title: 'Trending', lines: ['What is rising: popular models that were updated recently.'] },
};

const SORT_OPTIONS: { id: SortField; label: string }[] = [
  { id: 'auto', label: 'Best match' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'updated', label: 'Recently updated' },
  { id: 'name', label: 'Name' },
  { id: 'speed', label: 'Fastest on my computer' },
  { id: 'size', label: 'Size' },
  { id: 'context', label: 'Context window' },
  { id: 'versions', label: 'Versions' },
];

export default function Home() {
  // ---- data ----
  const [models, setModels] = useState<ModelData[]>([]); // official models with every version (from a live read)
  const [catalogue, setCatalogue] = useState<ModelData[]>([]); // every model on ollama.com (saved list)
  const [catalogueDate, setCatalogueDate] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<ModelData[]>([]);
  const [liveHits, setLiveHits] = useState<Record<string, string[]>>({});
  const [liveSearching, setLiveSearching] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [logs, setLogs] = useState<ScrapingLog[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; currentTask: string } | null>(null);

  // ---- view state ----
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [compare, setCompare] = useState<string[]>([]);
  const [openName, setOpenName] = useState<string | null>(null); // the model whose details are open
  const [versionsCache, setVersionsCache] = useState<Record<string, ModelVersion[]>>({});
  const [urlReady, setUrlReady] = useState(false);
  const [device, setDevice] = useState<Device | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showFilters, setShowFilters] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null); // end-of-list marker (state, so the observer is set up when it appears)
  const wide = useMedia('(min-width: 1024px)'); // sidebar on a wide screen, sheet otherwise
  const resultsRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

  const patch = useCallback((p: Partial<Filters>) => setFilters(f => ({ ...f, ...p })), []);

  // ---- loading ----
  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();
      setModels(data.models || []);
      setLastUpdated(data.lastUpdated || null);
      setCacheAge(data.cacheAgeMinutes ?? null);
      setIsPending(data.status === 'pending');
      setLogs(data.logs || []);
      setProgress(data.progress || null);
      return data.status;
    } catch (error) {
      console.log('No data found:', error);
      return 'error';
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    setLogs([]);
    setProgress(null);
    try {
      const onProgress = (message: string, current?: number, total?: number) => {
        setLogs(prev => [...prev.slice(-19), { timestamp: new Date(), message, type: 'info' as const }]);
        if (current !== undefined && total !== undefined) {
          setProgress({ current: Math.round((current / total) * 100), total: 100, currentTask: message.includes(':') ? message.split(':')[1].trim() : message });
        }
      };
      const scrapedModels = await scrapeOllamaModels(Infinity, onProgress);
      const cacheResponse = await fetch('/api/cache-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: scrapedModels, limit: Infinity }),
      });
      setModels(scrapedModels);
      setLastUpdated(new Date().toISOString());
      setCacheAge(0);
      setIsPending(false);
      onProgress(cacheResponse.ok ? '✅ Data cached successfully!' : '⚠️ Models loaded, but the server failed to cache them');
    } catch (error: any) {
      setLogs(prev => [...prev, { timestamp: new Date(), message: `❌ Scraping failed: ${error.message}`, type: 'error' as const }]);
    } finally {
      setRefreshing(false);
      setProgress(null);
    }
  };

  const runLiveSearch = async () => {
    const q = filters.q.trim();
    if (q.length < 2 || liveSearching) return;
    setLiveSearching(q);
    setLiveMessage(null);
    try {
      const found = await searchOllama(q, 10, message => setLiveMessage(message));
      setLiveResults(prev => {
        const names = new Set(prev.map(m => m.name));
        return [...prev, ...found.filter(m => !names.has(m.name))];
      });
      setLiveHits(prev => ({ ...prev, [q.toLowerCase()]: found.map(m => m.name) }));
      setLiveMessage(`Live search found ${found.length} models for “${q}”.`);
    } catch (error: any) {
      setLiveMessage(`Live search failed: ${error.message}`);
    } finally {
      setLiveSearching(null);
    }
  };

  useEffect(() => {
    Promise.all([
      fetchModels(),
      loadCatalogue().then(result => { if (result) { setCatalogue(result.models); setCatalogueDate(result.generatedAt); } }),
    ]).finally(() => setInitialLoading(false));
  }, []);

  // ---- theme ----
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    setTheme(saved === 'light' ? 'light' : 'dark'); // dark unless the visitor chose light
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  const toggleTheme = () => setTheme(t => { const next = t === 'dark' ? 'light' : 'dark'; localStorage.setItem(THEME_KEY, next); return next; });

  // ---- your computer: detected on its own, remembered if corrected ----
  const redetect = useCallback(async () => { localStorage.removeItem(DEVICE_KEY); setDevice(await detectDevice()); }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
      if (saved && typeof saved.memoryGB === 'number') { setDevice({ ...saved, bandwidthGBs: saved.bandwidthGBs || (saved.kind === 'gpu' ? 450 : saved.kind === 'unified' ? 200 : 50), manual: true }); return; }
    } catch { /* ignore */ }
    detectDevice().then(setDevice);
  }, []);
  const changeDevice = (d: Device | null) => {
    if (!d) { redetect(); return; }
    localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
    setDevice(d);
  };
  const memoryGB = device?.memoryGB ?? 10;
  const bandwidthGBs = device?.bandwidthGBs ?? 50;
  const machine: Machine | undefined = useMemo(() => (device ? { label: device.label, memoryGB: device.memoryGB, bandwidthGBs: device.bandwidthGBs } : undefined), [device]);

  // ---- address <-> state (shareable links) ----
  useEffect(() => {
    const { filters: f, compare: c, model: m } = queryToFilters(window.location.search);
    setFilters(f);
    setCompare(c);
    setOpenName(m || null);
    setUrlReady(true);
    const onPop = () => { const r = queryToFilters(window.location.search); setFilters(r.filters); setCompare(r.compare); setOpenName(r.model || null); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const id = setTimeout(() => {
      const next = `${window.location.pathname}${filtersToQuery(filters, compare, openName || '')}`;
      if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
    }, 250);
    return () => clearTimeout(id);
  }, [filters, compare, openName, urlReady]);

  // ---- every model we know about ----
  const allModels = useMemo(() => {
    const byName = new Map<string, ModelData>();
    const add = (m: ModelData) => {
      const existing = byName.get(m.name);
      if (!existing) { byName.set(m.name, m); return; }
      // keep the detailed record, but fill gaps (downloads, dates, history) from the other one
      byName.set(m.name, {
        ...m,
        ...existing,
        description: existing.description || m.description,
        pullsCount: existing.pullsCount || m.pullsCount,
        pulls: existing.pulls || m.pulls,
        tagsCount: existing.tagsCount || m.tagsCount,
        updated: existing.updated || m.updated,
        sizes: existing.sizes?.length ? existing.sizes : m.sizes,
        capabilities: existing.capabilities.length ? existing.capabilities : m.capabilities,
        firstSeen: existing.firstSeen || m.firstSeen,
        growth: existing.growth ?? m.growth,
        growthSince: existing.growthSince || m.growthSince,
      });
    };
    models.forEach(add);
    catalogue.forEach(add);
    liveResults.forEach(add);
    // versions fetched when a model's details were opened: real sizes instead of estimates
    for (const [name, versions] of Object.entries(versionsCache)) {
      const m = byName.get(name);
      if (m && !m.versions.length && versions.length) byName.set(name, { ...m, versions });
    }
    return Array.from(byName.values());
  }, [models, catalogue, liveResults, versionsCache]);

  const officialCount = useMemo(() => allModels.filter(m => !isCommunity(m)).length, [allModels]);
  const growthKnown = useMemo(() => hasGrowthData(allModels), [allModels]);

  const capabilityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allModels.forEach(m => m.capabilities.forEach(c => counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [allModels]);

  // ---- the list ----
  const liveNames = useMemo(() => new Set(liveHits[filters.q.trim().toLowerCase()] || []), [liveHits, filters.q]);
  const { models: results, hiddenDuplicates } = useMemo(
    () => applyFilters(allModels, filters, { memoryGB, bandwidthGBs }, Date.now(), liveNames),
    [allModels, filters, memoryGB, bandwidthGBs, liveNames],
  );
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filters, memoryGB, bandwidthGBs]);
  const visible = useMemo(() => results.slice(0, visibleCount), [results, visibleCount]);
  const hasMore = visibleCount < results.length;
  useEffect(() => {
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setVisibleCount(c => c + PAGE_SIZE);
    }, { rootMargin: '800px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasMore, visible.length]);

  const fitFor = useCallback((m: ModelData): Fit => fitOf(m, memoryGB, bandwidthGBs), [memoryGB, bandwidthGBs]);

  // ---- details drawer ----
  const openModel = openName ? allModels.find(m => m.name === openName) || null : null;
  const loadVersions = useCallback(async (m: ModelData): Promise<ModelVersion[]> => {
    if (versionsCache[m.name]) return versionsCache[m.name];
    const path = new URL(m.url).pathname; // "/library/llama3.1" or "/user/model"
    const versions = await fetchModelDetails(path);
    if (versions.length) setVersionsCache(c => ({ ...c, [m.name]: versions }));
    return versions;
  }, [versionsCache]);

  // ---- at a glance: what the computer can run, and what is new ----
  const glance = useMemo(() => {
    let runs = 0;
    let fast = 0;
    let fresh = 0;
    for (const m of allModels) {
      const f = fitOf(m, memoryGB, bandwidthGBs);
      if (f.status === 'good' || f.status === 'tight') { runs++; if (f.tps >= 40) fast++; }
      if (isNewModel(m)) fresh++;
    }
    return { runs, fast, fresh };
  }, [allModels, memoryGB, bandwidthGBs]);

  // ---- compare ----
  const byName = useMemo(() => new Map(allModels.map(m => [m.name, m])), [allModels]);
  const compared = useMemo(() => compare.map(n => byName.get(n)).filter((m): m is ModelData => Boolean(m)), [compare, byName]);
  const toggleCompare = (name: string) => setCompare(c => (c.includes(name) ? c.filter(n => n !== name) : c.length >= MAX_COMPARE ? c : [...c, name]));
  useEffect(() => { if (compared.length < 2) setShowCompare(false); }, [compared.length]);

  // ---- model of the week: the same pick all week for everyone ----
  const modelOfWeek = useMemo(() => {
    const pool = allModels.filter(m => m.description.length > 40 && (m.pullsCount || 0) > 100000).sort((a, b) => heatOf(b) - heatOf(a)).slice(0, 40);
    if (!pool.length) return null;
    const week = Math.floor(Date.now() / (7 * 86400000));
    return pool[week % pool.length];
  }, [allModels]);

  const filterCount = activeFilterCount(filters) + (filters.scope !== 'all' ? 1 : 0);
  const nothingChosen = !filters.q && !activeFilterCount(filters) && filters.scope === 'all' && filters.view === 'browse';

  // ---- when the list changes, bring the top of it into view (the list gets shorter, so a scrolled page would jump) ----
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const el = resultsRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 80) window.scrollTo({ top: window.scrollY + top - 150 });
  }, [filtersKey]);

  // ---- loading skeleton ----
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-10 lg:px-6">
          <div className="mb-6 h-11 max-w-2xl animate-pulse rounded-lg bg-zinc-800/50" />
          <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-900" />)}</div>
        </div>
      </div>
    );
  }

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...filters.tasks.map(id => ({ key: `task-${id}`, label: TASKS.find(t => t.id === id)?.label || id, remove: () => patch({ tasks: filters.tasks.filter(t => t !== id) }) })),
    ...filters.caps.map(c => ({ key: `cap-${c}`, label: c.charAt(0).toUpperCase() + c.slice(1), remove: () => patch({ caps: filters.caps.filter(x => x !== c) }) })),
    ...(filters.owner ? [{ key: 'owner', label: `By ${filters.owner}`, remove: () => patch({ owner: '' }) }] : []),
    ...(filters.updatedDays > 0 ? [{ key: 'upd', label: `Updated in ${filters.updatedDays} days`, remove: () => patch({ updatedDays: 0 }) }] : []),
    ...(filters.maxGB > 0 ? [{ key: 'max', label: `Under ${filters.maxGB} GB`, remove: () => patch({ maxGB: 0 }) }] : []),
    ...(filters.minContextK > 0 ? [{ key: 'ctx', label: `${filters.minContextK}K+ context`, remove: () => patch({ minContextK: 0 }) }] : []),
    ...(filters.minTps > 0 ? [{ key: 'tps', label: `${filters.minTps}+ tokens/s here`, remove: () => patch({ minTps: 0 }) }] : []),
    ...(filters.dedupe ? [{ key: 'dedupe', label: 'No near-duplicates', remove: () => patch({ dedupe: false }) }] : []),
    ...(filters.scope !== 'all' ? [{ key: 'scope', label: filters.scope === 'official' ? 'Official only' : 'Community only', remove: () => patch({ scope: 'all' }) }] : []),
  ];

  const note = filters.q.trim().length >= 2 && filters.scope !== 'official'
    ? 'live'
    : filters.view === 'trending'
      ? growthKnown ? 'Ranked by downloads gained since the last weekly update.' : 'Ranked by downloads and recent updates. Weekly download growth appears after the next list update.'
      : filters.view === 'new' ? 'Models added in the last 30 days or updated in the last 2 weeks, newest first.' : 'Most downloaded first. Click a model for its speed, versions and install command.';

  const panel = (
    <FilterPanel
      filters={filters}
      onChange={patch}
      device={device}
      onDevice={changeDevice}
      machine={machine}
      glance={glance}
      counts={{ all: allModels.length, official: officialCount, community: allModels.length - officialCount }}
      capabilities={capabilityCounts}
    />
  );

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <Head>
        <title>Ollama Models Explorer: every model on Ollama</title>
        <meta name="description" content="Search, filter and compare every model on Ollama, official and community, and see which ones run on your computer." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="alternate" type="application/rss+xml" title="New Ollama models" href="/feed.xml" />
      </Head>

      {/* Header: name, search, actions */}
      <header className="sticky top-0 z-30 border-b border-zinc-900 bg-black/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2.5 px-3 py-3 sm:px-4 lg:px-6">
          <div className="min-w-0 flex-1 md:flex-none">
            <h1 className="truncate text-base font-semibold sm:text-lg">Ollama Models Explorer</h1>
            <p className="hidden text-xs text-zinc-500 lg:block">{allModels.length.toLocaleString()} models · {officialCount.toLocaleString()} official · {(allModels.length - officialCount).toLocaleString()} community</p>
          </div>
          <div className="relative order-last w-full md:order-none md:mx-auto md:w-auto md:flex-1 md:max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
            <Input
              type="search"
              placeholder="Search 17,000+ models…"
              aria-label="Search models"
              value={filters.q}
              onChange={e => patch({ q: e.target.value })}
              className="h-11 rounded-xl border-zinc-800 bg-zinc-900 pl-12 text-base text-white focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-white"
            />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {nothingChosen && modelOfWeek && (
              <a href={modelOfWeek.url} target="_blank" rel="noopener noreferrer" data-testid="model-of-week" title={modelOfWeek.description} className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white xl:inline-flex">
                <Star className="h-3.5 w-3.5 text-amber-400" /><span>Model of the week:</span><span className="font-medium text-zinc-200">{modelOfWeek.name}</span>
              </a>
            )}
            <Tip tip={{ title: 'Source code', lines: ['Open this project on GitHub.'] }}>
              <a href="https://github.com/p32929/ollama_models_explorer" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository" className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white"><Github className="h-4 w-4" /></a>
            </Tip>
            <Tip tip={{ title: theme === 'dark' ? 'Light mode' : 'Dark mode', lines: ['Switch the colours. Your choice is remembered.'] }}>
              <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} data-testid="theme-toggle" className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white">
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </Tip>
            <Tip tip={{ title: 'Refresh', lines: ['Re-read the 270 official models from ollama.com, with every version, size and context window. Takes about a minute.'] }}>
              <Button variant="outline" onClick={refreshData} disabled={refreshing || isPending} className="h-10 rounded-lg border-zinc-800 bg-transparent px-3 text-zinc-300 hover:bg-zinc-900 hover:text-white disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${(refreshing || isPending) ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isPending ? 'Updating...' : refreshing ? 'Starting...' : 'Refresh'}</span>
              </Button>
            </Tip>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1800px] gap-8 px-3 py-4 sm:px-4 lg:px-6">
        {/* Filters: always visible on a wide screen */}
        {wide && (
          <div className="w-72 shrink-0">
            <div className="sticky top-[84px] max-h-[calc(100vh-100px)] overflow-y-auto pb-6 pr-1" style={{ scrollbarWidth: 'thin' }}>{panel}</div>
          </div>
        )}

        <main className="min-w-0 flex-1">
          {(isPending || refreshing) && (
            <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              {progress && isPending && (
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-sm text-zinc-300"><span>{progress.currentTask}</span><span>{Math.round(progress.current)}%</span></div>
                  <div className="h-2 w-full rounded-full bg-zinc-800"><div className="h-2 rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progress.current}%` }} /></div>
                </div>
              )}
              {logs.length > 0 && (
                <div className="space-y-1">
                  <h4 className="mb-2 text-sm font-medium text-zinc-300">Scraping Activity:</h4>
                  <div className="max-h-32 space-y-1 overflow-y-auto text-xs">
                    {logs.slice(-8).map((log, index) => (
                      <div key={index} className={`flex items-start gap-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'warning' ? 'text-yellow-400' : log.type === 'success' ? 'text-green-400' : 'text-zinc-400'}`}>
                        <span className="shrink-0 text-zinc-500">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View tabs, count and sort: this bar never changes size */}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-zinc-900">
            <div className="-mb-px flex max-w-full overflow-x-auto" role="tablist" aria-label="View">
              {VIEWS.map(v => (
                <Tip key={v.id} tip={VIEW_HELP[v.id]}>
                  <button
                    role="tab"
                    aria-selected={filters.view === v.id}
                    data-testid={`view-${v.id}`}
                    onClick={() => patch({ view: v.id })}
                    className={`inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors ${filters.view === v.id ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
                  >
                    {v.icon}{v.label}
                  </button>
                </Tip>
              ))}
            </div>
            <div className="mb-2 flex items-center gap-3">
              <span className="hidden whitespace-nowrap text-sm tabular-nums text-zinc-500 sm:inline"><span data-testid="counter">{results.length.toLocaleString()} of {allModels.length.toLocaleString()}</span> models</span>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-500">
                <span className="hidden sm:inline">Sort by</span>
                <select
                  value={filters.sort}
                  onChange={e => patch({ sort: e.target.value as SortField, dir: ['name', 'size', 'versions'].includes(e.target.value) ? 'asc' : 'desc' })}
                  aria-label="Sort by"
                  data-testid="sort-select"
                  className="h-10 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 lg:h-9"
                >
                  {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              {!wide && (
                <button onClick={() => setShowFilters(true)} data-testid="open-filters" className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm ${filterCount ? 'border-zinc-500 bg-zinc-800 text-white' : 'border-zinc-700 text-zinc-300'}`}>
                  <SlidersHorizontal className="h-4 w-4" />Filters{filterCount > 0 && <span className="rounded-full bg-white px-1.5 text-xs font-semibold text-black">{filterCount}</span>}
                </button>
              )}
            </div>
          </div>

          {/* Active filters (a fixed-height row, so adding one never moves the list) */}
          <div className="mt-3 flex min-h-8 flex-wrap items-center gap-1.5 text-xs" data-testid="active-filters">
            {chips.map(c => (
              <button key={c.key} onClick={c.remove} aria-label={`Remove filter ${c.label}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-zinc-800 pl-3 pr-2 text-zinc-100 hover:bg-zinc-700">
                {c.label}<X className="h-3.5 w-3.5 text-zinc-400" />
              </button>
            ))}
            {chips.length > 1 && <button onClick={() => patch({ ...DEFAULT_FILTERS, q: filters.q, view: filters.view, sort: filters.sort, dir: filters.dir })} className="inline-flex h-8 items-center rounded-full px-2.5 text-zinc-400 hover:text-white">Clear all</button>}
          </div>

          {/* One line of explanation or help, always the same height */}
          <div className="mt-1 min-h-8 text-xs sm:min-h-5 text-zinc-500">
            {note === 'live' ? (
              <span data-testid="live-search">
                <span className="text-zinc-400">Can&apos;t find it? The saved list can be a few days old. </span>
                <button onClick={runLiveSearch} disabled={liveSearching !== null} className="text-blue-400 underline underline-offset-2 hover:text-blue-300 disabled:opacity-60">
                  {liveSearching ? 'Searching…' : `Search ollama.com live for “${filters.q.trim()}”`}
                </button>
                {liveMessage && <span className="ml-2 text-zinc-500">{liveMessage}</span>}
              </span>
            ) : <span data-testid={filters.view === 'trending' ? 'trending-note' : undefined}>{note}</span>}
          </div>

          {/* Results */}
          <div ref={resultsRef} className="mt-3 min-h-[70vh]">
            {allModels.length === 0 && !isPending && !refreshing ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-16 text-center">
                <div className="mb-6 inline-block rounded-full border border-zinc-700 bg-zinc-800 p-5"><Search className="h-8 w-8 text-zinc-500" /></div>
                <h3 className="mb-3 text-2xl font-medium">No Models Loaded</h3>
                <p className="mb-8 text-zinc-400">Click the &quot;Refresh&quot; button above to load models from Ollama.com</p>
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-16 text-center" data-testid="no-results">
                <div className="mb-6 inline-block rounded-full border border-zinc-700 bg-zinc-800 p-5"><Search className="h-8 w-8 text-zinc-500" /></div>
                <h3 className="mb-3 text-xl font-medium">No models match</h3>
                <p className="mb-6 px-4 text-zinc-400">Try fewer filters{filters.fitOnly ? ', or turn off “Only show what runs on it”' : ''}.</p>
                <Button onClick={() => setFilters({ ...DEFAULT_FILTERS, view: filters.view === 'trending' ? 'trending' : 'browse' })} variant="outline" className="h-10 border-zinc-700 bg-zinc-800 px-4 text-sm text-white hover:bg-zinc-700">Clear everything</Button>
              </div>
            ) : (
              <div className="space-y-2.5" data-testid="card-list">
                {visible.map(m => (
                  <ModelRow
                    key={m.name}
                    model={m}
                    fit={fitFor(m)}
                    machine={machine}
                    selected={compare.includes(m.name)}
                    canSelect={compare.length < MAX_COMPARE}
                    onToggle={() => toggleCompare(m.name)}
                    onOwner={owner => patch({ owner, scope: 'community' })}
                    onOpen={() => setOpenName(m.name)}
                    relativeTime={relativeTime}
                    gained={filters.view === 'trending' && growthKnown ? m.growth : undefined}
                  />
                ))}
                {hasMore && <div ref={setSentinel} className="py-4 text-center text-xs text-zinc-500">Showing {visible.length.toLocaleString()} of {results.length.toLocaleString()} · scroll for more</div>}
              </div>
            )}
          </div>

          <footer className="mt-10 space-y-2 text-center text-sm text-zinc-600">
            <p>{allModels.length.toLocaleString()} models • {officialCount.toLocaleString()} official, {(allModels.length - officialCount).toLocaleString()} community{catalogueDate ? ` • list saved ${new Date(catalogueDate).toLocaleDateString()}` : ''}</p>
            <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
              <a href="/api/v1/models?limit=20" className="inline-flex items-center gap-1 hover:text-zinc-300"><Braces className="h-3 w-3" />JSON API</a>
              <a href="/feed.xml" className="inline-flex items-center gap-1 hover:text-zinc-300"><Rss className="h-3 w-3" />New models feed</a>
              <a href="https://github.com/p32929/ollama_models_explorer" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-300"><Github className="h-3 w-3" />Source</a>
            </p>
            {lastUpdated && <p className="text-xs">Official models re-read: {new Date(lastUpdated).toLocaleString()}{cacheAge !== null ? ` (${cacheAge} min ago)` : ''}</p>}
          </footer>
        </main>
      </div>

      {/* Compare bar */}
      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur" data-testid="compare-bar">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <GitCompare className="hidden h-4 w-4 text-zinc-400 sm:block" />
            <div className="min-w-0 flex-1 truncate text-sm text-zinc-300"><span data-testid="compare-count">{compare.length}</span> selected{compare.length < 2 ? ': pick one more to compare' : ''}</div>
            <Button variant="outline" onClick={() => setCompare([])} className="h-10 border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900">Clear</Button>
            <Button onClick={() => setShowCompare(true)} disabled={compared.length < 2} data-testid="open-compare" className="h-10 bg-white text-black hover:bg-zinc-200 disabled:opacity-50">Compare</Button>
          </div>
        </div>
      )}

      {/* Filters as a sheet on a phone or tablet */}
      {!wide && showFilters && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setShowFilters(false)} data-testid="filter-sheet">
          <div role="dialog" aria-modal="true" aria-label="Filters" onClick={e => e.stopPropagation()} className="flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-zinc-800 bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="text-base font-semibold">Filters {filterCount > 0 && <span className="font-normal text-zinc-500">({filterCount})</span>}</h2>
              <button onClick={() => setShowFilters(false)} aria-label="Close filters" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">{panel}</div>
            <div className="border-t border-zinc-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={() => setShowFilters(false)} data-testid="show-results" className="h-11 w-full rounded-lg bg-white text-sm font-semibold text-black">Show {results.length.toLocaleString()} models</button>
            </div>
          </div>
        </div>
      )}

      {openModel && (
        <ModelDrawer
          model={openModel}
          device={device}
          loadVersions={loadVersions}
          relativeTime={relativeTime}
          onClose={() => setOpenName(null)}
          onOwner={owner => patch({ owner, scope: 'community' })}
          compareSelected={compare.includes(openModel.name)}
          canCompare={compare.length < MAX_COMPARE}
          onToggleCompare={() => toggleCompare(openModel.name)}
        />
      )}
      {showCompare && compared.length >= 2 && (
        <CompareDialog
          models={compared}
          fitOf={fitFor}
          machine={machine}
          deviceLabel={device?.label || 'your computer'}
          relativeTime={relativeTime}
          onRemove={name => setCompare(c => c.filter(n => n !== name))}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}
