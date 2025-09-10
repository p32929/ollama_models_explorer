import React, { useState, useEffect, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  ExternalLink, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Code2, 
  Brain, 
  Gauge, 
  Tag, 
  Clock, 
  ImageIcon, 
  MessagesSquare,
  Sparkles,
  Database,
  Github,
  RefreshCw,
  Info
} from 'lucide-react';

import { ModelData, ModelVersion, ApiResponse, ScrapingLog } from '@/lib/types';
import { scrapeOllamaModels } from '@/lib/clientScraper';

type SortField = 'name' | 'capabilities' | 'versions' | 'size' | 'context';
type SortDirection = 'asc' | 'desc';

// Mapping capabilities to their appropriate icons
const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  'vision': <ImageIcon className="w-3.5 h-3.5" />,
  'image': <ImageIcon className="w-3.5 h-3.5" />,
  'chat': <MessagesSquare className="w-3.5 h-3.5" />,
  'code': <Code2 className="w-3.5 h-3.5" />,
  'embedding': <Brain className="w-3.5 h-3.5" />,
};

export default function Home() {
  // State management
  const [models, setModels] = useState<ModelData[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [logs, setLogs] = useState<ScrapingLog[]>([]);
  const [progress, setProgress] = useState<{current: number; total: number; currentTask: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [activeCapabilityFilter, setActiveCapabilityFilter] = useState<string | null>(null);

  // Data fetching function
  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();
      setModels(data.models || []);
      setLastUpdated(data.lastUpdated || null);
      setCacheAge(data.cacheAgeMinutes || null);
      setIsPending(data.status === 'pending');
      setLogs(data.logs || []);
      setProgress(data.progress || null);
      return data.status;
    } catch (error) {
      console.log('No data found:', error);
      return 'error';
    }
  };

  // Polling function for when data is pending
  const pollForUpdates = async (startTime: number = Date.now(), maxDuration: number = 60000) => {
    const status = await fetchModels();
    const elapsed = Date.now() - startTime;
    
    if (status === 'pending' && elapsed < maxDuration) {
      // Continue polling every 5 seconds for up to 1 minute
      setTimeout(() => pollForUpdates(startTime, maxDuration), 5000);
    } else {
      // Data is ready, error, or max time exceeded - stop polling
      if (elapsed >= maxDuration && status === 'pending') {
        console.log('Polling stopped after 1 minute, but scraping may still complete');
      }
      setRefreshing(false);
    }
  };

  // Refresh data using client-side scraping
  const refreshData = async () => {
    setRefreshing(true);
    setLogs([]);
    setProgress(null);
    
    try {
      const limit = Infinity; // Or get from user input
      
      const onProgress = (message: string, current?: number, total?: number) => {
        const log = {
          timestamp: new Date(),
          message,
          type: 'info' as const
        };
        setLogs(prev => [...prev.slice(-19), log]); // Keep last 20 logs
        
        if (current !== undefined && total !== undefined) {
          setProgress({
            current: Math.round((current / total) * 100),
            total: 100,
            currentTask: message.includes(':') ? message.split(':')[1].trim() : message
          });
        }
      };
      
      // Perform client-side scraping
      const scrapedModels = await scrapeOllamaModels(limit, onProgress);
      
      // Send scraped data to server for caching
      const cacheResponse = await fetch('/api/cache-models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ models: scrapedModels, limit })
      });
      
      if (cacheResponse.ok) {
        // Refresh the UI with new data
        await fetchModels();
        onProgress('✅ Data cached successfully!');
      } else {
        throw new Error('Failed to cache scraped data');
      }
      
    } catch (error: any) {
      console.error('Error during client-side scraping:', error);
      const errorLog = {
        timestamp: new Date(),
        message: `❌ Scraping failed: ${error.message}`,
        type: 'error' as const
      };
      setLogs(prev => [...prev, errorLog]);
    } finally {
      setRefreshing(false);
      setProgress(null);
    }
  };

  // Initial data fetching
  useEffect(() => {
    fetchModels().finally(() => setInitialLoading(false));
  }, []);

  // Extract unique capabilities across all models for filtering
  const allCapabilities = useMemo(() => {
    const capabilities = new Set<string>();
    models.forEach(model => {
      model.capabilities.forEach(cap => capabilities.add(cap.toLowerCase()));
    });
    return Array.from(capabilities).sort();
  }, [models]);

  // Sorting logic
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort icon display helper
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-40" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4 text-blue-500" />
      : <ArrowDown className="ml-2 h-4 w-4 text-blue-500" />;
  };

  // Size parser for consistent comparison
  const parseSize = (sizeStr: string): number => {
    if (!sizeStr) return 0;
    const num = parseFloat(sizeStr.replace(/[^0-9.]/g, ''));
    if (sizeStr.toLowerCase().includes('tb')) return num * 1000;
    if (sizeStr.toLowerCase().includes('kb')) return num / 1000;
    return num; // Assume GB by default
  };

  // Context window parser for consistent comparison
  const parseContext = (contextStr: string): number => {
    if (!contextStr) return 0;
    const num = parseInt(contextStr.replace(/[^0-9]/g, ''));
    if (contextStr.toLowerCase().includes('k')) return num;
    if (contextStr.toLowerCase().includes('m')) return num * 1000;
    return num / 1000; // Default to K for comparison
  };

  // Advanced filtering and sorting
  const filteredAndSortedModels = useMemo(() => {
    // Step 1: Filter by search term and capability filter
    let filtered = models.filter((model: ModelData) => {
      const searchLower = searchTerm.toLowerCase();
      
      // Special search terms
      const isSmallestSearch = searchLower.includes('small') || searchLower.includes('tiny');
      const isLargestSearch = searchLower.includes('large') || searchLower.includes('big');
      const isLatestSearch = searchLower.includes('latest') || searchLower.includes('newest') || searchLower.includes('recent');
      const isContextSearch = searchLower.includes('context');
      
      // Basic field matching
      const nameMatch = model.name.toLowerCase().includes(searchLower);
      const descMatch = model.description.toLowerCase().includes(searchLower);
      const capMatch = model.capabilities.some(cap => cap.toLowerCase().includes(searchLower));
      
      // Advanced semantic matching
      const hasLatest = model.versions.some(v => v.isLatest);
      const hasVersions = model.versions.length > 0;
      
      // Active capability filter
      const passesCapabilityFilter = !activeCapabilityFilter || 
        model.capabilities.some(cap => cap.toLowerCase() === activeCapabilityFilter);

      return (
        // Must pass capability filter if one is active
        passesCapabilityFilter && (
          // Either matches basic fields
          nameMatch || descMatch || capMatch ||
          // Or matches special semantic search terms
          (isSmallestSearch && hasVersions) ||
          (isLargestSearch && hasVersions) ||
          (isContextSearch && hasVersions) ||
          (isLatestSearch && hasLatest)
        )
      );
    });

    // Step 2: Apply sorting
    return filtered.sort((a: ModelData, b: ModelData) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'capabilities':
          aValue = a.capabilities.length;
          bValue = b.capabilities.length;
          break;
        case 'versions':
          aValue = a.versions.length;
          bValue = b.versions.length;
          break;
        case 'size':
          const aSizes = a.versions.map(v => parseSize(v.size)).filter(s => s > 0);
          const bSizes = b.versions.map(v => parseSize(v.size)).filter(s => s > 0);
          aValue = aSizes.length > 0 ? Math.min(...aSizes) : 0;
          bValue = bSizes.length > 0 ? Math.min(...bSizes) : 0;
          break;
        case 'context':
          const aContexts = a.versions.map(v => parseContext(v.context)).filter(c => c > 0);
          const bContexts = b.versions.map(v => parseContext(v.context)).filter(c => c > 0);
          aValue = aContexts.length > 0 ? Math.max(...aContexts) : 0;
          bValue = bContexts.length > 0 ? Math.max(...bContexts) : 0;
          break;
        default:
          aValue = a.name;
          bValue = b.name;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [models, searchTerm, sortField, sortDirection, activeCapabilityFilter]);

  // Helper to get model size range for display
  const getModelSizes = (versions: ModelVersion[]) => {
    const sizes = versions.map(v => v.size).filter(s => s && s !== '');
    if (sizes.length === 0) return 'N/A';
    if (sizes.length === 1) return sizes[0];
    
    // Sort sizes numerically for proper min/max
    const numericSizes = sizes.map(s => parseSize(s));
    const minSize = sizes[numericSizes.indexOf(Math.min(...numericSizes))];
    const maxSize = sizes[numericSizes.indexOf(Math.max(...numericSizes))];
    
    return minSize === maxSize ? minSize : `${minSize} – ${maxSize}`;
  };

  // Helper to get maximum context window for display
  const getMaxContext = (versions: ModelVersion[]) => {
    const contexts = versions.map(v => v.context).filter(c => c && c !== '');
    if (contexts.length === 0) return 'N/A';
    
    // Find max context window
    const numericContexts = contexts.map(c => parseContext(c));
    return contexts[numericContexts.indexOf(Math.max(...numericContexts))];
  };

  // Helper to format relative time
  const getRelativeTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  // Display proper icon for capability
  const getCapabilityIcon = (capability: string) => {
    const lowerCap = capability.toLowerCase();
    
    // Check for each capability type
    for (const [key, icon] of Object.entries(CAPABILITY_ICONS)) {
      if (lowerCap.includes(key)) {
        return icon;
      }
    }
    
    // Default icon if no specific one is found
    return <Sparkles className="w-3.5 h-3.5" />;
  };

  // Loading state
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="container mx-auto px-6 py-16">
          <div className="w-full mx-auto">
            {/* Simple loading UI */}
            <div className="text-center mb-12">
              <div className="h-12 w-64 bg-zinc-800/50 mx-auto mb-4 rounded animate-pulse"></div>
              <div className="h-6 w-96 max-w-full bg-zinc-800/30 mx-auto mb-8 rounded animate-pulse"></div>
              <div className="h-14 w-full max-w-md bg-zinc-800/50 mx-auto rounded-lg animate-pulse"></div>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-8 w-20 bg-zinc-800/40 rounded-full animate-pulse"></div>
                ))}
              </div>
            </div>
            
            {/* Table loading */}
            <div className="overflow-hidden bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent bg-zinc-950">
                      {["Model", "Capabilities", "Versions", "Size", "Context", "Link"].map((header, i) => (
                        <TableHead key={i} className="cursor-pointer py-4 text-zinc-300 font-medium hover:text-violet-400 transition-colors">
                          <div className="flex items-center">
                            <span>{header}</span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array(5).fill(0).map((_, i) => (
                      <TableRow key={i} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                        <TableCell className="py-2.5">
                          <div className="h-6 w-32 rounded bg-zinc-800/60 animate-pulse"></div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="flex gap-1.5">
                            <div className="h-5 w-16 rounded-full bg-zinc-800/60 animate-pulse"></div>
                            <div className="h-5 w-16 rounded-full bg-zinc-800/60 animate-pulse"></div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="h-5 w-12 bg-zinc-800/60 rounded animate-pulse"></div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="h-5 w-20 bg-zinc-800/60 rounded animate-pulse"></div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="h-5 w-16 bg-zinc-800/60 rounded animate-pulse"></div>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <div className="h-7 w-7 rounded-full bg-zinc-800/60 animate-pulse ml-auto"></div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Continue with normal UI even if no models (will show empty list)

  // Main UI
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-3">
        <div className="w-full mx-auto">
          {/* Header with GitHub Link and Refresh Button */}
          <div className="flex justify-between items-center text-sm mb-3">
            <a href="https://github.com/p32929/ollama_models_explorer" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-zinc-400 hover:text-white transition-colors">
              <Github className="h-4 w-4 mr-1" />
              <span>GitHub Repository</span>
            </a>
            
            <div className="flex items-center gap-3">
              {/* Cache info */}
              {lastUpdated && (
                <div className="flex items-center text-zinc-500 text-xs">
                  <Info className="h-3 w-3 mr-1" />
                  <span>
                    Updated {cacheAge !== null ? `${cacheAge} min ago` : lastUpdated ? new Date(lastUpdated).toLocaleString() : 'recently'}
                  </span>
                </div>
              )}
              
              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                onClick={refreshData}
                disabled={refreshing || isPending}
                className="text-xs bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${(refreshing || isPending) ? 'animate-spin' : ''}`} />
                {isPending ? 'Updating...' : refreshing ? 'Starting...' : 'Refresh Data'}
              </Button>
            </div>
          </div>
          
          {/* Progress and Logs Display - only show during active scraping */}
          {(isPending || refreshing) && (
            <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              {/* Progress Bar */}
              {progress && isPending && (
                <div className="mb-3">
                  <div className="flex justify-between text-sm text-zinc-300 mb-1">
                    <span>{progress.currentTask}</span>
                    <span>{Math.round(progress.current)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                      style={{width: `${progress.current}%`}}
                    ></div>
                  </div>
                </div>
              )}
              
              {/* Logs */}
              {logs.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-zinc-300 mb-2">Scraping Activity:</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
                    {logs.slice(-8).map((log, index) => (
                      <div 
                        key={index} 
                        className={`flex items-start gap-2 ${
                          log.type === 'error' ? 'text-red-400' :
                          log.type === 'warning' ? 'text-yellow-400' :
                          log.type === 'success' ? 'text-green-400' :
                          'text-zinc-400'
                        }`}
                      >
                        <span className="text-zinc-500 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})}
                        </span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Search */}
          <div className="mb-2">
            
            <div className="w-full max-w-xl mx-auto relative mb-4">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                <Search className="h-5 w-5" />
              </div>
              <Input
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-24 h-9 text-sm bg-zinc-900 border-zinc-800 text-white rounded-md shadow-lg focus-visible:ring-1 focus-visible:ring-white focus-visible:border-transparent"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                {filteredAndSortedModels.length} of {models.length}
              </div>
            </div>
            
            {/* Capability filters */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mb-5">
              <Button
                variant={activeCapabilityFilter === null ? "secondary" : "outline"}
                size="sm"
                onClick={() => setActiveCapabilityFilter(null)}
                className={`rounded-full text-xs font-medium px-3 py-0.5 h-7 ${activeCapabilityFilter === null ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-white'}`}
              >
                All
              </Button>
              {allCapabilities.slice(0, 8).map(capability => (
                <Button
                  key={capability}
                  variant={activeCapabilityFilter === capability ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setActiveCapabilityFilter(capability === activeCapabilityFilter ? null : capability)}
                  className={`rounded-full text-xs font-medium gap-1 px-3 py-0.5 h-7 ${activeCapabilityFilter === capability ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-white'}`}
                >
                  {getCapabilityIcon(capability)}
                  <span className="capitalize">{capability}</span>
                </Button>
              ))}
            </div>
            
            {/* Filtered by indicator */}
            {activeCapabilityFilter && (
              <div className="text-center text-xs text-zinc-400 mb-3">
                <span>Filtered by <span className="text-white capitalize">{activeCapabilityFilter}</span></span>
              </div>
            )}
          </div>

          {/* Table */}
          {models.length === 0 && !isPending && !refreshing ? (
            // No models loaded yet - show load button
            <div className="text-center py-16 bg-zinc-900 rounded-lg border border-zinc-800 shadow-lg">
              <div className="inline-block rounded-full bg-zinc-800 p-5 mb-6 border border-zinc-700">
                <Search className="h-8 w-8 text-zinc-500" />
              </div>
              <h3 className="text-2xl font-medium text-white mb-3">No Models Loaded</h3>
              <p className="text-zinc-400 mb-8">Click the "Refresh Data" button above to load models from Ollama.com</p>
            </div>
          ) : filteredAndSortedModels.length > 0 ? (
            <div className="overflow-hidden bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent bg-zinc-950">
                      <TableHead
                        className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center">
                          <span>Model</span> {getSortIcon('name')}
                        </div>
                      </TableHead>
                      <TableHead className="py-2.5 text-zinc-300 font-medium">
                        Capabilities
                      </TableHead>
                      <TableHead
                        className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors"
                        onClick={() => handleSort('versions')}
                      >
                        <div className="flex items-center">
                          <span>Versions</span> {getSortIcon('versions')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors"
                        onClick={() => handleSort('size')}
                      >
                        <div className="flex items-center">
                          <Gauge className="mr-2 h-4 w-4 text-zinc-400" />
                          <span>Size</span> {getSortIcon('size')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer py-2.5 text-zinc-300 font-medium hover:text-white transition-colors"
                        onClick={() => handleSort('context')}
                      >
                        <div className="flex items-center">
                          <Brain className="mr-2 h-4 w-4 text-zinc-400" />
                          <span>Context</span> {getSortIcon('context')}
                        </div>
                      </TableHead>
                      <TableHead className="text-right py-2.5 text-zinc-300 font-medium">
                        Link
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedModels.map((model, index) => (
                      <TableRow 
                        key={index} 
                        className="border-zinc-800 hover:bg-zinc-800/50 transition-colors"
                      >
                        <TableCell className="py-2.5">
                          <div className="font-medium text-white">
                            {model.name}
                          </div>
                          <div className="text-sm text-zinc-400 mt-1 max-w-52 lg:max-w-md truncate">
                            {model.description}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="flex flex-wrap gap-1 mt-1">
                            {model.capabilities.slice(0, 3).map((capability, idx) => (
                              <Badge 
                                key={idx} 
                                variant="secondary" 
                                className="bg-zinc-800 text-white border-zinc-700 flex items-center gap-1.5 py-1 h-auto"
                              >
                                {getCapabilityIcon(capability)}
                                <span className="text-xs capitalize">
                                  {capability.toLowerCase()}
                                </span>
                              </Badge>
                            ))}
                            {model.capabilities.length > 3 && (
                              <Badge 
                                variant="outline" 
                                className="text-xs bg-transparent border-zinc-700 text-white"
                              >
                                +{model.capabilities.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 hidden sm:table-cell">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-white bg-zinc-800 px-2.5 py-0.5 rounded-md min-w-[2rem] text-center">
                              {model.versions.length}
                            </span>
                            {model.versions.some(v => v.isLatest) && (
                              <Badge className="bg-zinc-800 text-white border-zinc-700 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span className="text-xs">latest</span>
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 hidden md:table-cell">
                          <div className="font-mono text-sm text-white bg-zinc-800 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 text-zinc-400" />
                            {getModelSizes(model.versions)}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 hidden lg:table-cell">
                          <div className="font-mono text-sm text-white bg-zinc-800 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1.5">
                            <Gauge className="h-3.5 w-3.5 text-zinc-400" />
                            {getMaxContext(model.versions)}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <Button
                            variant="outline"
                            size="icon"
                            asChild
                            className="h-9 w-9 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white hover:text-white"
                          >
                            <a href={model.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${model.name}`}>
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : models.length > 0 ? (
            // Models are loaded but none match search/filter
            <div className="text-center py-16 bg-zinc-900 rounded-lg border border-zinc-800 shadow-lg">
              <div className="inline-block rounded-full bg-zinc-800 p-5 mb-6 border border-zinc-700">
                <Search className="h-8 w-8 text-zinc-500" />
              </div>
              <h3 className="text-2xl font-medium text-white mb-3">No models match your search</h3>
              <p className="text-zinc-400 mb-8">Try adjusting your search or filters</p>
              <Button 
                onClick={() => {
                  setSearchTerm('');
                  setActiveCapabilityFilter(null);
                }}
                variant="outline"
                className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-1 h-auto text-xs"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            // Loading or pending state - show empty table structure
            <div className="overflow-hidden bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent bg-zinc-950">
                      <TableHead className="py-2.5 text-zinc-300 font-medium">Model</TableHead>
                      <TableHead className="py-2.5 text-zinc-300 font-medium">Capabilities</TableHead>
                      <TableHead className="py-2.5 text-zinc-300 font-medium">Versions</TableHead>
                      <TableHead className="py-2.5 text-zinc-300 font-medium">Size</TableHead>
                      <TableHead className="py-2.5 text-zinc-300 font-medium">Context</TableHead>
                      <TableHead className="py-2.5 text-zinc-300 font-medium">Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={6} className="py-8 text-center text-zinc-400">
                        {isPending ? 'Loading models from Ollama.com...' : refreshing ? 'Starting scraper...' : 'Ready to load models'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          {/* Footer */}
          <div className="mt-10 text-center text-sm text-zinc-600 space-y-2">
            <p>Data served from in-memory cache • {models.length} models loaded</p>
            {lastUpdated && (
              <p className="text-xs">
                Last updated: {new Date(lastUpdated).toLocaleString()}
                {cacheAge !== null && cacheAge > 0 && (
                  <span className="ml-2">({cacheAge} minutes ago)</span>
                )}
              </p>
            )}
            {!lastUpdated && (
              <p className="text-xs text-zinc-500">
                No data loaded yet • Click "Refresh Data" to load models from Ollama.com
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
