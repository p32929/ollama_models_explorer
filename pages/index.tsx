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
import {
  ExternalLink, Search, ArrowUpDown, ArrowUp, ArrowDown, Code2, Brain, Gauge, Tag, Clock, ImageIcon, MessagesSquare,
  Sparkles, Github, RefreshCw, Info, SlidersHorizontal, GitCompare, Sun, Moon, Flame, Rss, Braces, Star, X,
} from 'lucide-react';

import { ModelData, ScrapingLog } from '@/lib/types';
import { scrapeOllamaModels, searchOllama } from '@/lib/clientScraper';
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
      if (saved && typeof saved.memoryGB === 'number') { setDevice({ ...saved, manual: true }); return; }
    } catch { /* ignore */ }
    detectDevice().then(setDevice);
  }, []);
  const changeDevice = (d: Device | null) => {
    if (!d) { redetect(); return; }
    localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
    setDevice(d);
  };
  const memoryGB = device?.memoryGB ?? 10;

  // ---- address <-> state (shareable links) ----
  useEffect(() => {
    const { filters: f, compare: c } = queryToFilters(window.location.search);
    setFilters(f);
    setCompare(c);
    setUrlReady(true);
    const onPop = () => { const r = queryToFilters(window.location.search); setFilters(r.filters); setCompare(r.compare); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const id = setTimeout(() => {
      const next = `${window.location.pathname}${filtersToQuery(filters, compare)}`;
      if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
    }, 250);
    return () => clearTimeout(id);
  }, [filters, compare, urlReady]);

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
    return Array.from(byName.values());
  }, [models, catalogue, liveResults]);

  const officialCount = useMemo(() => allModels.filter(m => !isCommunity(m)).length, [allModels]);
  const growthKnown = useMemo(() => hasGrowthData(allModels), [allModels]);

  const allCapabilities = useMemo(() => {
    const counts = new Map<string, number>();
    allModels.forEach(m => m.capabilities.forEach(c => counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c).sort();
  }, [allModels]);

  // ---- the list ----
  const liveNames = useMemo(() => new Set(liveHits[filters.q.trim().toLowerCase()] || []), [liveHits, filters.q]);
  const { models: results, hiddenDuplicates } = useMemo(
    () => applyFilters(allModels, filters, memoryGB, Date.now(), liveNames),
    [allModels, filters, memoryGB, liveNames],
  );
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filters, memoryGB]);
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

  const fitFor = useCallback((m: ModelData): Fit => fitOf(m, memoryGB), [memoryGB]);

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
    else patch({ sort: field, dir: field === 'downloads' || field === 'updated' || field === 'context' ? 'desc' : 'asc' });
  };
  const sortIcon = (field: SortField) => {
    if (filters.sort !== field) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-40" />;
    return filters.dir === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 text-blue-500" /> : <ArrowDown className="ml-2 h-4 w-4 text-blue-500" />;
  };

  const filterCount = activeFilterCount({ ...filters, cap: null, task: null, fitOnly: false }); // those three have their own buttons
  const nothingChosen = !filters.q && !activeFilterCount(filters) && filters.scope === 'all' && filters.view === 'browse';

  // ---- loading skeleton ----
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="container mx-auto px-4 py-10">
          <div className="h-11 max-w-xl mx-auto rounded-lg bg-zinc-800/50 animate-pulse mb-6" />
          <div className="space-y-3 max-w-5xl mx-auto">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 rounded-xl bg-zinc-900 animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  const taskLabel = TASKS.find(t => t.id === filters.task)?.label;

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <Head>
        <title>Ollama Models Explorer: every model on Ollama</title>
        <meta name="description" content="Search, filter and compare every model on Ollama, official and community, and see which ones run on your computer." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="alternate" type="application/rss+xml" title="New Ollama models" href="/feed.xml" />
      </Head>
      <div className="container mx-auto px-3 sm:px-4 py-3">
        <div className="w-full mx-auto">
          {/* Top bar */}
          <div className="flex justify-between items-center text-sm mb-3 gap-2">
            <a href="https://github.com/p32929/ollama_models_explorer" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-zinc-400 hover:text-white transition-colors min-h-10" aria-label="GitHub repository">
              <Github className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">GitHub Repository</span>
            </a>
            <div className="flex items-center gap-2 sm:gap-3">
              {lastUpdated && (
                <div className="hidden sm:flex items-center text-zinc-500 text-xs">
                  <Info className="h-3 w-3 mr-1" />
                  <span>Updated {cacheAge !== null ? `${cacheAge} min ago` : new Date(lastUpdated).toLocaleString()}</span>
                </div>
              )}
              <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} data-testid="theme-toggle" className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <Button variant="outline" size="sm" onClick={refreshData} disabled={refreshing || isPending} className="h-10 text-xs bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 mr-1 ${(refreshing || isPending) ? 'animate-spin' : ''}`} />
                {isPending ? 'Updating...' : refreshing ? 'Starting...' : <><span className="sm:hidden">Refresh</span><span className="hidden sm:inline">Refresh Data</span></>}
              </Button>
            </div>
          </div>

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

          {/* Search */}
          <div className="w-full max-w-xl mx-auto relative mb-3">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"><Search className="h-5 w-5" /></div>
            <Input
              type="search"
              placeholder="Search models..."
              aria-label="Search models"
              value={filters.q}
              onChange={e => patch({ q: e.target.value })}
              className="pl-12 pr-24 h-11 text-base sm:text-sm sm:h-10 bg-zinc-900 border-zinc-800 text-white rounded-md shadow-lg focus-visible:ring-1 focus-visible:ring-white focus-visible:border-transparent"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500" data-testid="counter">
              {results.length.toLocaleString()} of {allModels.length.toLocaleString()}
            </div>
          </div>

          {/* Your computer */}
          <div className="mb-3"><DevicePicker device={device} onChange={changeDevice} fitOnly={filters.fitOnly} onFitOnly={v => patch({ fitOnly: v })} /></div>

          {/* Views and scope */}
          <div className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-0.5" role="tablist" aria-label="View">
              {VIEWS.map(v => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={filters.view === v.id}
                  data-testid={`view-${v.id}`}
                  onClick={() => patch({ view: v.id })}
                  className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors ${filters.view === v.id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                >
                  {v.icon}{v.label}
                </button>
              ))}
            </div>
            <div className="flex max-w-full items-center gap-1 overflow-x-auto" role="tablist" aria-label="Which models to show">
              {([['all', 'All', allModels.length], ['official', 'Official', officialCount], ['community', 'Community', allModels.length - officialCount]] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={filters.scope === value}
                  data-testid={`scope-${value}`}
                  onClick={() => patch({ scope: value })}
                  className={`h-9 whitespace-nowrap rounded-md px-3 text-xs sm:text-sm font-medium transition-colors ${filters.scope === value ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
                >
                  {label} <span className="text-zinc-500">{count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>

          {/* What do you want to do? */}
          <div className="mb-3 -mx-3 sm:mx-0">
            <div className="flex gap-1.5 overflow-x-auto px-3 sm:px-0 sm:flex-wrap sm:justify-center pb-1" data-testid="quick-picks" style={{ scrollbarWidth: 'none' }}>
              {TASKS.map(t => (
                <button
                  key={t.id}
                  onClick={() => patch({ task: filters.task === t.id ? null : t.id })}
                  aria-pressed={filters.task === t.id}
                  title={t.hint}
                  data-testid={`task-${t.id}`}
                  className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors ${filters.task === t.id ? 'border-white bg-white text-black' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-white'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Capabilities, sort and more filters */}
          <div className="mb-3 -mx-3 sm:mx-0">
            <div className="flex gap-1.5 overflow-x-auto px-3 sm:px-0 sm:flex-wrap sm:justify-center pb-1" data-testid="capabilities" style={{ scrollbarWidth: 'none' }}>
              {allCapabilities.map(c => (
                <Button
                  key={c}
                  variant={filters.cap === c ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => patch({ cap: filters.cap === c ? null : c })}
                  className={`shrink-0 rounded-full text-xs font-medium gap-1 px-3 py-0.5 h-8 ${filters.cap === c ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-white'}`}
                >
                  {capabilityIcon(c)}<span className="capitalize">{c}</span>
                </Button>
              ))}
            </div>
          </div>
          <div className="mb-4 flex items-center justify-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <span>Sort</span>
              <select
                value={filters.sort}
                onChange={e => patch({ sort: e.target.value as SortField, dir: ['name', 'size', 'versions'].includes(e.target.value) ? 'asc' : 'desc' })}
                aria-label="Sort by"
                data-testid="sort-select"
                className="h-9 rounded-full border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200"
              >
                {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <button
              onClick={() => setShowFilters(true)}
              data-testid="open-filters"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-700 px-3.5 text-sm text-zinc-200 hover:bg-zinc-900"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters{filterCount > 0 && <span className="rounded-full bg-white px-1.5 text-xs font-semibold text-black">{filterCount}</span>}
            </button>
          </div>

          {/* Active choices */}
          {(filters.cap || filters.task || filters.owner || filters.updatedDays > 0 || filters.maxGB > 0 || filters.minContextK > 0 || filters.dedupe) && (
            <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5 text-xs" data-testid="active-filters">
              {[
                filters.task && `Task: ${taskLabel}`,
                filters.cap && `Capability: ${filters.cap}`,
                filters.owner && `By ${filters.owner}`,
                filters.updatedDays > 0 && `Updated in ${filters.updatedDays} days`,
                filters.maxGB > 0 && `Under ${filters.maxGB} GB`,
                filters.minContextK > 0 && `${filters.minContextK}K+ context`,
                filters.dedupe && 'No near-duplicates',
              ].filter(Boolean).map(label => <span key={String(label)} className="rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-200">{label}</span>)}
              <button onClick={() => patch({ cap: null, task: null, owner: '', updatedDays: 0, maxGB: 0, minContextK: 0, dedupe: false })} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-zinc-400 hover:text-white"><X className="h-3 w-3" />Clear</button>
            </div>
          )}

          {filters.q.trim().length >= 2 && filters.scope !== 'official' && (
            <div className="text-center text-xs text-zinc-400 mb-3" data-testid="live-search">
              <span>Can&apos;t find it? The saved list can be a few days old. </span>
              <button onClick={runLiveSearch} disabled={liveSearching !== null} className="text-blue-400 hover:text-blue-300 underline underline-offset-2 disabled:opacity-60">
                {liveSearching ? 'Searching…' : `Search ollama.com live for “${filters.q.trim()}”`}
              </button>
              {liveMessage && <div className="mt-1 text-zinc-500">{liveMessage}</div>}
            </div>
          )}

          {filters.view === 'trending' && (
            <p className="mb-3 text-center text-xs text-zinc-500" data-testid="trending-note">
              {growthKnown
                ? 'Ranked by downloads gained since the last weekly update.'
                : 'Ranked by downloads and recent updates. Weekly download growth appears after the next list update.'}
            </p>
          )}
          {filters.view === 'new' && <p className="mb-3 text-center text-xs text-zinc-500">Models added or updated in the last two weeks, newest first.</p>}

          {/* Model of the week */}
          {nothingChosen && modelOfWeek && (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-950 p-3 sm:p-3.5" data-testid="model-of-week">
              <Star className="h-5 w-5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">Model of the week</div>
                <div className="font-semibold text-white break-words">{modelOfWeek.name}</div>
                <p className="line-clamp-1 sm:line-clamp-2 text-sm text-zinc-400">{modelOfWeek.description}</p>
              </div>
              <a href={modelOfWeek.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${modelOfWeek.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800"><ExternalLink className="h-4 w-4" /></a>
            </div>
          )}

          {/* Results */}
          {allModels.length === 0 && !isPending && !refreshing ? (
            <div className="text-center py-16 bg-zinc-900 rounded-lg border border-zinc-800 shadow-lg">
              <div className="inline-block rounded-full bg-zinc-800 p-5 mb-6 border border-zinc-700"><Search className="h-8 w-8 text-zinc-500" /></div>
              <h3 className="text-2xl font-medium text-white mb-3">No Models Loaded</h3>
              <p className="text-zinc-400 mb-8">Click the &quot;Refresh Data&quot; button above to load models from Ollama.com</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 bg-zinc-900 rounded-lg border border-zinc-800 shadow-lg" data-testid="no-results">
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
                  relativeTime={relativeTime}
                />
              ))}
              {hasMore && <div ref={setSentinel} className="py-4 text-center text-xs text-zinc-500">Showing {visible.length.toLocaleString()} of {results.length.toLocaleString()} · scroll for more</div>}
            </div>
          ) : (
            <div className="overflow-hidden bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent bg-zinc-950">
                      <TableHead className="w-10 py-2.5"><span className="sr-only">Compare</span></TableHead>
                      <TableHead className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors" onClick={() => handleSort('name')}>
                        <div className="flex items-center"><span>Model</span> {sortIcon('name')}</div>
                      </TableHead>
                      <TableHead className="py-2.5 text-zinc-300 font-medium">Capabilities</TableHead>
                      <TableHead className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors hidden xl:table-cell" onClick={() => handleSort('versions')}>
                        <div className="flex items-center"><span>Versions</span> {sortIcon('versions')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors" onClick={() => handleSort('size')}>
                        <div className="flex items-center"><Gauge className="mr-2 h-4 w-4 text-zinc-400" /><span>Size</span> {sortIcon('size')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors hidden 2xl:table-cell" onClick={() => handleSort('context')}>
                        <div className="flex items-center"><Brain className="mr-2 h-4 w-4 text-zinc-400" /><span>Context</span> {sortIcon('context')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors" onClick={() => handleSort('downloads')}>
                        <div className="flex items-center"><span>Downloads</span> {sortIcon('downloads')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors hidden 2xl:table-cell" onClick={() => handleSort('updated')}>
                        <div className="flex items-center"><span>Updated</span> {sortIcon('updated')}</div>
                      </TableHead>
                      <TableHead className="text-right py-2.5 text-zinc-300 font-medium">Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map(model => {
                      const owner = ownerOf(model);
                      const fit = fitFor(model);
                      const picked = compare.includes(model.name);
                      return (
                        <TableRow key={model.name} data-testid="model-row" data-name={model.name} className={`border-zinc-800 hover:bg-zinc-800/50 transition-colors ${picked ? 'bg-blue-500/5' : ''}`}>
                          <TableCell className="py-2.5 w-10">
                            <input
                              type="checkbox"
                              checked={picked}
                              disabled={!picked && compare.length >= MAX_COMPARE}
                              onChange={() => toggleCompare(model.name)}
                              aria-label={`Compare ${model.name}`}
                              data-testid="compare-check"
                              className="h-4 w-4 accent-blue-500 cursor-pointer"
                            />
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="font-medium text-white" data-testid="model-name">
                              {owner ? (
                                <><button onClick={() => patch({ owner, scope: 'community' })} title={`Show everything by ${owner}`} className="text-zinc-500 hover:text-zinc-300 font-normal">{owner}/</button>{model.name.slice(owner.length + 1)}</>
                              ) : model.name}
                              {isNewModel(model) && daysSince(model.firstSeen) <= 30 && <Badge className="ml-2 bg-blue-500/20 text-blue-300 border-transparent text-[10px] uppercase">New</Badge>}
                            </div>
                            <div className="text-sm text-zinc-400 mt-1 max-w-52 lg:max-w-md truncate">{model.description}</div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex flex-wrap gap-1 mt-1">
                              {model.capabilities.slice(0, 3).map((capability, idx) => (
                                <Badge key={idx} variant="secondary" className="bg-zinc-800 text-white border-zinc-700 flex items-center gap-1.5 py-1 h-auto">
                                  {capabilityIcon(capability)}<span className="text-xs capitalize">{capability.toLowerCase()}</span>
                                </Badge>
                              ))}
                              {model.capabilities.length > 3 && <Badge variant="outline" className="text-xs bg-transparent border-zinc-700 text-white">+{model.capabilities.length - 3}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 hidden xl:table-cell">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-white bg-zinc-800 px-2.5 py-0.5 rounded-md min-w-[2rem] text-center">{model.versions.length || model.tagsCount || 0}</span>
                              {model.versions.some(v => v.isLatest) && (
                                <Badge className="bg-zinc-800 text-white border-zinc-700 flex items-center gap-1"><Clock className="h-3 w-3" /><span className="text-xs">latest</span></Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex flex-col items-start gap-1.5">
                              <div className="font-mono text-sm text-white bg-zinc-800 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-zinc-400" />{sizeSummary(model)}</div>
                              <FitBadge fit={fit} />
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 hidden 2xl:table-cell">
                            <div className="font-mono text-sm text-white bg-zinc-800 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1.5">
                              <Gauge className="h-3.5 w-3.5 text-zinc-400" />
                              {(() => { const c = maxContextK(model); return c ? (c >= 1000 ? `${c / 1000}M` : `${c}K`) : 'N/A'; })()}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 text-sm text-zinc-300 tabular-nums" data-testid="downloads">
                            {model.pulls || '—'}
                            {filters.view === 'trending' && growthKnown && model.growth ? <div className="text-xs text-emerald-400">+{model.growth.toLocaleString()}</div> : null}
                          </TableCell>
                          <TableCell className="py-2.5 hidden 2xl:table-cell text-sm text-zinc-400 whitespace-nowrap">{model.updated ? relativeTime(model.updated) : '—'}</TableCell>
                          <TableCell className="py-2.5 text-right">
                            <Button variant="outline" size="icon" asChild className="h-9 w-9 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white hover:text-white">
                              <a href={model.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${model.name}`}><ExternalLink className="h-4 w-4" /></a>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {hasMore && <div ref={setSentinel} className="py-4 text-center text-xs text-zinc-500 border-t border-zinc-800">Showing {visible.length.toLocaleString()} of {results.length.toLocaleString()} · scroll for more</div>}
            </div>
          )}

          {/* Footer */}
          <div className="mt-10 text-center text-sm text-zinc-600 space-y-2">
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
          </div>
        </div>
      </div>

      {/* Compare bar */}
      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" data-testid="compare-bar">
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
