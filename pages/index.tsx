import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Head from 'next/head';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModelCard } from '@/components/ModelCard';
import { FitBadge } from '@/components/FitBadge';
import { DevicePicker } from '@/components/DevicePicker';
import { CompareDialog } from '@/components/CompareDialog';
import { FilterSheet } from '@/components/FilterSheet';
import { Dropdown } from '@/components/Dropdown';
import { ModelDrawer } from '@/components/ModelDrawer';
import { SpeedBadge, speedOfFit } from '@/components/SpeedBadge';
import {
  ExternalLink, Search, ArrowUpDown, ArrowUp, ArrowDown, Code2, Brain, Gauge, Tag, Clock, ImageIcon, MessagesSquare,
  Sparkles, Github, RefreshCw, Info, SlidersHorizontal, GitCompare, Sun, Moon, Flame, Rss, Braces, Star, X,
} from 'lucide-react';

import { ModelData, ModelVersion, ScrapingLog } from '@/lib/types';
import { scrapeOllamaModels, searchOllama, fetchModelDetails } from '@/lib/clientScraper';
import { loadCatalogue } from '@/lib/catalogue';
import { detectDevice, type Device } from '@/lib/device';
import { fitOf, type Fit } from '@/lib/fit';
import { TASKS } from '@/lib/tasks';
import { daysSince } from '@/lib/units';
import {
  applyFilters, activeFilterCount, DEFAULT_FILTERS, hasGrowthData, heatOf, isNewModel, isCommunity, ownerOf, sizeSummary, maxContextK,
  type Filters, type SortField, type View,
} from '@/lib/filter';
import { filtersToQuery, queryToFilters } from '@/lib/urlState';

const PAGE_SIZE = 150; // rows drawn at a time: the full catalogue is tens of thousands of models
const MAX_COMPARE = 4;
const DEVICE_KEY = 'ome.device';
const THEME_KEY = 'ome.theme';

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  vision: <ImageIcon className="w-3.5 h-3.5" />,
  image: <ImageIcon className="w-3.5 h-3.5" />,
  chat: <MessagesSquare className="w-3.5 h-3.5" />,
  code: <Code2 className="w-3.5 h-3.5" />,
  embedding: <Brain className="w-3.5 h-3.5" />,
};
const capabilityIcon = (capability: string) => {
  const lower = capability.toLowerCase();
  for (const [key, icon] of Object.entries(CAPABILITY_ICONS)) if (lower.includes(key)) return icon;
  return <Sparkles className="w-3.5 h-3.5" />;
};

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

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

const VIEWS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'browse', label: 'Browse', icon: <Search className="h-3.5 w-3.5" /> },
  { id: 'new', label: "What's new", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'trending', label: 'Trending', icon: <Flame className="h-3.5 w-3.5" /> },
];

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
  const isMobile = useIsMobile();

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

  const handleSort = (field: SortField) => {
    if (filters.sort === field) patch({ dir: filters.dir === 'asc' ? 'desc' : 'asc' });
    else patch({ sort: field, dir: field === 'downloads' || field === 'updated' || field === 'context' || field === 'speed' ? 'desc' : 'asc' });
  };
  const sortIcon = (field: SortField) => {
    if (filters.sort !== field) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-40" />;
    return filters.dir === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 text-blue-500" /> : <ArrowDown className="ml-2 h-4 w-4 text-blue-500" />;
  };

  const filterCount = activeFilterCount({ ...filters, caps: [], tasks: [], fitOnly: false }); // those have their own controls
  const nothingChosen = !filters.q && !activeFilterCount(filters) && filters.scope === 'all' && filters.view === 'browse';

  // ---- loading skeleton ----
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="w-full px-4 py-10 lg:px-6">
          <div className="h-11 max-w-2xl rounded-lg bg-zinc-800/50 animate-pulse mb-6" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 rounded-xl bg-zinc-900 animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  const taskOptions = TASKS.map(t => ({ value: t.id, label: t.label, hint: t.hint }));
  const capabilityOptions = capabilityCounts.map(([c, n]) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1), icon: capabilityIcon(c), count: n }));

  // everything that is narrowing the list, each removable on its own
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...filters.tasks.map(id => ({ key: `task-${id}`, label: TASKS.find(t => t.id === id)?.label || id, remove: () => patch({ tasks: filters.tasks.filter(t => t !== id) }) })),
    ...filters.caps.map(c => ({ key: `cap-${c}`, label: c.charAt(0).toUpperCase() + c.slice(1), remove: () => patch({ caps: filters.caps.filter(x => x !== c) }) })),
    ...(filters.owner ? [{ key: 'owner', label: `By ${filters.owner}`, remove: () => patch({ owner: '' }) }] : []),
    ...(filters.updatedDays > 0 ? [{ key: 'upd', label: `Updated in ${filters.updatedDays} days`, remove: () => patch({ updatedDays: 0 }) }] : []),
    ...(filters.maxGB > 0 ? [{ key: 'max', label: `Under ${filters.maxGB} GB`, remove: () => patch({ maxGB: 0 }) }] : []),
    ...(filters.minContextK > 0 ? [{ key: 'ctx', label: `${filters.minContextK}K+ context`, remove: () => patch({ minContextK: 0 }) }] : []),
    ...(filters.dedupe ? [{ key: 'dedupe', label: 'No near-duplicates', remove: () => patch({ dedupe: false }) }] : []),
    ...(filters.minTps > 0 ? [{ key: 'tps', label: `${filters.minTps}+ tokens/s here`, remove: () => patch({ minTps: 0 }) }] : []),
  ];

  const th = 'py-3 text-xs font-medium uppercase tracking-wide text-zinc-500';
  const sortable = `${th} cursor-pointer select-none hover:text-white transition-colors`;

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <Head>
        <title>Ollama Models Explorer: every model on Ollama</title>
        <meta name="description" content="Search, filter and compare every model on Ollama, official and community, and see which ones run on your computer." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="alternate" type="application/rss+xml" title="New Ollama models" href="/feed.xml" />
      </Head>
      <div className="w-full px-3 sm:px-4 lg:px-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold sm:text-lg">Ollama Models Explorer</h1>
            <p className="hidden text-xs text-zinc-500 sm:block">
              {allModels.length.toLocaleString()} models · {officialCount.toLocaleString()} official · {(allModels.length - officialCount).toLocaleString()} community
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {nothingChosen && modelOfWeek && (
              <a
                href={modelOfWeek.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="model-of-week"
                title={modelOfWeek.description}
                className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white md:inline-flex"
              >
                <Star className="h-3.5 w-3.5 text-amber-400" />
                <span>Model of the week:</span>
                <span className="font-medium text-zinc-200">{modelOfWeek.name}</span>
              </a>
            )}
            {lastUpdated && (
              <span className="hidden items-center text-xs text-zinc-500 xl:flex"><Info className="mr-1 h-3 w-3" />Updated {cacheAge !== null ? `${cacheAge} min ago` : new Date(lastUpdated).toLocaleString()}</span>
            )}
            <a href="https://github.com/p32929/ollama_models_explorer" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository" className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white lg:h-9 lg:w-9">
              <Github className="h-4 w-4" />
            </a>
            <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} data-testid="theme-toggle" className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white lg:h-9 lg:w-9">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Button variant="outline" size="sm" onClick={refreshData} disabled={refreshing || isPending} title="Re-read the official models with all their versions" className="h-10 lg:h-9 border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-white disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${(refreshing || isPending) ? 'animate-spin' : ''}`} />
              <span>{isPending ? 'Updating...' : refreshing ? 'Starting...' : 'Refresh'}</span>
            </Button>
          </div>
        </header>

        {(isPending || refreshing) && (
          <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            {progress && isPending && (
              <div className="mb-3">
                <div className="flex justify-between text-sm text-zinc-300 mb-1"><span>{progress.currentTask}</span><span>{Math.round(progress.current)}%</span></div>
                <div className="w-full bg-zinc-800 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress.current}%` }} /></div>
              </div>
            )}
            {logs.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-zinc-300 mb-2">Scraping Activity:</h4>
                <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
                  {logs.slice(-8).map((log, index) => (
                    <div key={index} className={`flex items-start gap-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'warning' ? 'text-yellow-400' : log.type === 'success' ? 'text-green-400' : 'text-zinc-400'}`}>
                      <span className="text-zinc-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search and your computer */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-2xl lg:flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
            <Input
              type="search"
              placeholder="Search 17,000+ models…"
              aria-label="Search models"
              value={filters.q}
              onChange={e => patch({ q: e.target.value })}
              className="h-12 rounded-lg border-zinc-800 bg-zinc-900 pl-12 pr-24 text-base text-white focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-white"
            />
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs tabular-nums text-zinc-500" data-testid="counter">
              {results.length.toLocaleString()} of {allModels.length.toLocaleString()}
            </div>
          </div>
          <div className="lg:ml-auto"><DevicePicker device={device} onChange={changeDevice} fitOnly={filters.fitOnly} onFitOnly={v => patch({ fitOnly: v })} /></div>
        </div>

        {/* At a glance */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-zinc-400" data-testid="glance">
          <button onClick={() => patch({ fitOnly: !filters.fitOnly })} className="hover:text-white" data-testid="glance-runs">
            <span className="font-semibold text-emerald-400 tabular-nums">{glance.runs.toLocaleString()}</span> run on {device?.manual ? 'your' : 'this'} computer
          </button>
          <button onClick={() => patch({ minTps: filters.minTps === 40 ? 0 : 40, fitOnly: false })} className="hover:text-white" data-testid="glance-fast">
            <span className="font-semibold text-lime-400 tabular-nums">{glance.fast.toLocaleString()}</span> write 40+ tokens per second
          </button>
          <button onClick={() => patch({ view: 'new' })} className="hover:text-white" data-testid="glance-new">
            <span className="font-semibold text-blue-400 tabular-nums">{glance.fresh.toLocaleString()}</span> new or updated lately
          </button>
          <span className="hidden text-xs text-zinc-600 lg:ml-auto lg:inline">Click any model for its speed, versions and install command</span>
        </div>

        {/* Which models: source tabs on the left, view on the right */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-zinc-800">
          <div className="-mb-px flex max-w-full overflow-x-auto" role="tablist" aria-label="Which models to show">
            {([['all', 'All', allModels.length], ['official', 'Official', officialCount], ['community', 'Community', allModels.length - officialCount]] as const).map(([value, label, count]) => (
              <button
                key={value}
                role="tab"
                aria-selected={filters.scope === value}
                data-testid={`scope-${value}`}
                onClick={() => patch({ scope: value })}
                className={`h-11 whitespace-nowrap border-b-2 px-3.5 text-sm font-medium transition-colors ${filters.scope === value ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
              >
                {label} <span className="ml-1 text-zinc-500 tabular-nums">{count.toLocaleString()}</span>
              </button>
            ))}
          </div>
          <div className="mb-1.5 inline-flex max-w-full overflow-x-auto rounded-lg bg-zinc-900 p-0.5" role="tablist" aria-label="View">
            {VIEWS.map(v => (
              <button
                key={v.id}
                role="tab"
                aria-selected={filters.view === v.id}
                data-testid={`view-${v.id}`}
                onClick={() => patch({ view: v.id })}
                className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors ${filters.view === v.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
              >
                {v.icon}{v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="-mx-3 mt-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0" data-testid="filter-bar" style={{ scrollbarWidth: 'none' }}>
          <Dropdown id="tasks" label="I want to" icon={<Sparkles className="h-4 w-4 text-zinc-400" />} multi options={taskOptions} selected={filters.tasks} onChange={tasks => patch({ tasks })} help="Pick one or more: models must match all of them" />
          <Dropdown id="caps" label="Capabilities" icon={<Brain className="h-4 w-4 text-zinc-400" />} multi options={capabilityOptions} selected={filters.caps} onChange={caps => patch({ caps })} help="Models must have all the ones you tick" />
          <button
            onClick={() => setShowFilters(true)}
            data-testid="open-filters"
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm transition-colors lg:h-9 ${filterCount ? 'border-zinc-500 bg-zinc-800 text-white' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-white'}`}
          >
            <SlidersHorizontal className="h-4 w-4 text-zinc-400" /> More filters{filterCount > 0 && <span className="rounded-full bg-white px-1.5 text-xs font-semibold text-black">{filterCount}</span>}
          </button>
          <label className="ml-auto inline-flex shrink-0 items-center gap-2 text-sm text-zinc-500">
            <span className="hidden sm:inline">Sort by</span>
            <select
              value={filters.sort}
              onChange={e => patch({ sort: e.target.value as SortField, dir: ['name', 'size', 'versions'].includes(e.target.value) ? 'asc' : 'desc' })}
              aria-label="Sort by"
              data-testid="sort-select"
              className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 lg:h-9"
            >
              {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs" data-testid="active-filters">
            {chips.map(c => (
              <button key={c.key} onClick={c.remove} aria-label={`Remove filter ${c.label}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-zinc-800 pl-3 pr-2 text-zinc-100 hover:bg-zinc-700">
                {c.label}<X className="h-3.5 w-3.5 text-zinc-400" />
              </button>
            ))}
            <button onClick={() => patch({ caps: [], tasks: [], owner: '', updatedDays: 0, maxGB: 0, minContextK: 0, dedupe: false, minTps: 0 })} className="inline-flex h-8 items-center rounded-full px-2.5 text-zinc-400 hover:text-white">Clear all</button>
          </div>
        )}

        {filters.q.trim().length >= 2 && filters.scope !== 'official' && (
          <div className="mt-3 text-xs text-zinc-400" data-testid="live-search">
            <span>Can&apos;t find it? The saved list can be a few days old. </span>
            <button onClick={runLiveSearch} disabled={liveSearching !== null} className="text-blue-400 hover:text-blue-300 underline underline-offset-2 disabled:opacity-60">
              {liveSearching ? 'Searching…' : `Search ollama.com live for “${filters.q.trim()}”`}
            </button>
            {liveMessage && <div className="mt-1 text-zinc-500">{liveMessage}</div>}
          </div>
        )}
        {filters.view === 'trending' && (
          <p className="mt-3 text-xs text-zinc-500" data-testid="trending-note">
            {growthKnown ? 'Ranked by downloads gained since the last weekly update.' : 'Ranked by downloads and recent updates. Weekly download growth appears after the next list update.'}
          </p>
        )}
        {filters.view === 'new' && <p className="mt-3 text-xs text-zinc-500">Models added or updated in the last two weeks, newest first.</p>}

        {/* Results */}
        <div className="mt-4">
        {allModels.length === 0 && !isPending && !refreshing ? (
          <div className="text-center py-16 bg-zinc-900 rounded-lg border border-zinc-800">
            <div className="inline-block rounded-full bg-zinc-800 p-5 mb-6 border border-zinc-700"><Search className="h-8 w-8 text-zinc-500" /></div>
            <h3 className="text-2xl font-medium text-white mb-3">No Models Loaded</h3>
            <p className="text-zinc-400 mb-8">Click the &quot;Refresh&quot; button above to load models from Ollama.com</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900 rounded-lg border border-zinc-800" data-testid="no-results">
            <div className="inline-block rounded-full bg-zinc-800 p-5 mb-6 border border-zinc-700"><Search className="h-8 w-8 text-zinc-500" /></div>
            <h3 className="text-xl font-medium text-white mb-3">No models match</h3>
            <p className="text-zinc-400 mb-6 px-4">Try fewer filters{filters.fitOnly ? ', or turn off “Only show what runs on it”' : ''}.</p>
            <Button onClick={() => setFilters({ ...DEFAULT_FILTERS, view: filters.view === 'trending' ? 'trending' : 'browse' })} variant="outline" className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-1 h-10 text-sm">Clear everything</Button>
          </div>
        ) : isMobile ? (
          <div className="space-y-2.5" data-testid="card-list">
            {visible.map(m => (
              <ModelCard
                key={m.name}
                model={m}
                fit={fitFor(m)}
                selected={compare.includes(m.name)}
                canSelect={compare.length < MAX_COMPARE}
                onToggle={() => toggleCompare(m.name)}
                onOwner={owner => patch({ owner, scope: 'community' })}
                onOpen={() => setOpenName(m.name)}
                relativeTime={relativeTime}
              />
            ))}
            {hasMore && <div ref={setSentinel} className="py-4 text-center text-xs text-zinc-500">Showing {visible.length.toLocaleString()} of {results.length.toLocaleString()} · scroll for more</div>}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 bg-zinc-950 hover:bg-transparent">
                    <TableHead className="w-12 pl-4"><span className="sr-only">Compare</span></TableHead>
                    <TableHead className={sortable} onClick={() => handleSort('name')}><div className="flex items-center">Model {sortIcon('name')}</div></TableHead>
                    <TableHead className={th}>On {device?.manual ? 'your' : 'this'} computer</TableHead>
                    <TableHead className={sortable} onClick={() => handleSort('speed')} title="Estimated tokens per second on your computer (about 0.75 words each)"><div className="flex items-center">Speed {sortIcon('speed')}</div></TableHead>
                    <TableHead className={sortable} onClick={() => handleSort('size')}><div className="flex items-center">Size {sortIcon('size')}</div></TableHead>
                    <TableHead className={`${th} hidden lg:table-cell`}>Capabilities</TableHead>
                    <TableHead className={sortable} onClick={() => handleSort('downloads')}><div className="flex items-center">Downloads {sortIcon('downloads')}</div></TableHead>
                    <TableHead className={`${sortable} hidden xl:table-cell`} onClick={() => handleSort('updated')}><div className="flex items-center">Updated {sortIcon('updated')}</div></TableHead>
                    <TableHead className={`${sortable} hidden 2xl:table-cell`} onClick={() => handleSort('context')}><div className="flex items-center">Context {sortIcon('context')}</div></TableHead>
                    <TableHead className="w-14 pr-4"><span className="sr-only">Open</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(model => {
                    const owner = ownerOf(model);
                    const fit = fitFor(model);
                    const picked = compare.includes(model.name);
                    const ctx = maxContextK(model);
                    return (
                      <TableRow
                        key={model.name}
                        data-testid="model-row"
                        data-name={model.name}
                        tabIndex={0}
                        onClick={() => setOpenName(model.name)}
                        onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) setOpenName(model.name); }}
                        className={`cursor-pointer border-zinc-900 transition-colors hover:bg-zinc-900/60 focus-visible:bg-zinc-900 focus-visible:outline-none ${picked ? 'bg-blue-500/5' : ''}`}
                      >
                        <TableCell className="w-12 py-3 pl-4">
                          <input
                            type="checkbox"
                            checked={picked}
                            disabled={!picked && compare.length >= MAX_COMPARE}
                            onChange={() => toggleCompare(model.name)}
                            onClick={e => e.stopPropagation()}
                            aria-label={`Compare ${model.name}`}
                            data-testid="compare-check"
                            className="h-4 w-4 cursor-pointer accent-blue-500"
                          />
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="text-[15px] font-medium text-white" data-testid="model-name">
                            {owner ? (
                              <><button onClick={e => { e.stopPropagation(); patch({ owner, scope: 'community' }); }} title={`Show everything by ${owner}`} className="font-normal text-zinc-500 hover:text-zinc-300">{owner}/</button>{model.name.slice(owner.length + 1)}</>
                            ) : model.name}
                            {isNewModel(model) && daysSince(model.firstSeen) <= 30 && <Badge className="ml-2 border-transparent bg-blue-500/20 text-[10px] uppercase text-blue-300">New</Badge>}
                          </div>
                          <div className="mt-0.5 max-w-xl truncate text-sm text-zinc-500">{model.description}</div>
                        </TableCell>
                        <TableCell className="py-3"><FitBadge fit={fit} /></TableCell>
                        <TableCell className="py-3 text-sm" data-testid="speed-cell"><SpeedBadge tps={speedOfFit(fit)} compact /></TableCell>
                        <TableCell className="py-3">
                          <div className="font-mono text-sm text-zinc-100 whitespace-nowrap">{sizeSummary(model)}</div>
                          {(model.versions.length || model.tagsCount) ? <div className="text-xs text-zinc-500">{model.versions.length || model.tagsCount} versions</div> : null}
                        </TableCell>
                        <TableCell className="hidden py-3 lg:table-cell">
                          <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap" title={model.capabilities.join(', ')}>
                            {model.capabilities.slice(0, 2).map(c => (
                              <span key={c} className="inline-flex items-center gap-1 rounded-md bg-zinc-800/70 px-2 py-0.5 text-xs capitalize text-zinc-300">{capabilityIcon(c)}{c.toLowerCase()}</span>
                            ))}
                            {model.capabilities.length > 2 && <span className="px-1 text-xs text-zinc-500">+{model.capabilities.length - 2}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-sm tabular-nums text-zinc-200" data-testid="downloads">
                          {model.pulls || '—'}
                          {filters.view === 'trending' && growthKnown && model.growth ? <div className="text-xs text-emerald-400">+{model.growth.toLocaleString()}</div> : null}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap py-3 text-sm text-zinc-400 xl:table-cell">{model.updated ? relativeTime(model.updated) : '—'}</TableCell>
                        <TableCell className="hidden py-3 font-mono text-sm text-zinc-300 2xl:table-cell">{ctx ? (ctx >= 1000 ? `${ctx / 1000}M` : `${ctx}K`) : <span className="text-zinc-600">—</span>}</TableCell>
                        <TableCell className="w-14 py-3 pr-4 text-right">
                          <a href={model.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} aria-label={`Visit ${model.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white"><ExternalLink className="h-4 w-4" /></a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {hasMore && <div ref={setSentinel} className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-500">Showing {visible.length.toLocaleString()} of {results.length.toLocaleString()} · scroll for more</div>}
          </div>
        )}
        </div>

        {/* Footer */}
        <footer className="mt-10 space-y-2 text-center text-sm text-zinc-600">
          <p>
            {allModels.length.toLocaleString()} models • {officialCount.toLocaleString()} official, {(allModels.length - officialCount).toLocaleString()} community
            {catalogueDate ? ` • list saved ${new Date(catalogueDate).toLocaleDateString()}` : ''}
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
            <a href="/api/v1/models?limit=20" className="inline-flex items-center gap-1 hover:text-zinc-300"><Braces className="h-3 w-3" />JSON API</a>
            <a href="/feed.xml" className="inline-flex items-center gap-1 hover:text-zinc-300"><Rss className="h-3 w-3" />New models feed</a>
            <a href="https://github.com/p32929/ollama_models_explorer" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-300"><Github className="h-3 w-3" />Source</a>
          </p>
          {lastUpdated && <p className="text-xs">Official models re-read: {new Date(lastUpdated).toLocaleString()}</p>}
        </footer>
      </div>

      {/* Compare bar */}
      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur" data-testid="compare-bar">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <GitCompare className="hidden h-4 w-4 text-zinc-400 sm:block" />
            <div className="min-w-0 flex-1 truncate text-sm text-zinc-300">
              <span data-testid="compare-count">{compare.length}</span> selected{compare.length < 2 ? ': pick one more to compare' : ''}
            </div>
            <Button variant="outline" onClick={() => setCompare([])} className="h-10 border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900">Clear</Button>
            <Button onClick={() => setShowCompare(true)} disabled={compared.length < 2} data-testid="open-compare" className="h-10 bg-white text-black hover:bg-zinc-200 disabled:opacity-50">Compare</Button>
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
      {showFilters && <FilterSheet filters={filters} onChange={patch} onClose={() => setShowFilters(false)} resultCount={results.length} hiddenDuplicates={hiddenDuplicates} />}
      {showCompare && compared.length >= 2 && (
        <CompareDialog
          models={compared}
          fitOf={fitFor}
          deviceLabel={device?.label || 'your computer'}
          relativeTime={relativeTime}
          onRemove={name => setCompare(c => c.filter(n => n !== name))}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}
