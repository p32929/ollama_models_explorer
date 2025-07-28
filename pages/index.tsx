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
  Database
} from 'lucide-react';

// Detailed type definitions for strong typing
interface ModelVersion {
  name: string;
  size: string;
  context: string;
  input: string;
  updated: string;
  isLatest?: boolean;
  url: string;
}

interface ModelData {
  name: string;
  url: string;
  description: string;
  capabilities: string[];
  pulls: string;
  tags: string;
  updated: string;
  versions: ModelVersion[];
}

interface ApiResponse {
  models: ModelData[];
  limit?: number;
}

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
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [activeCapabilityFilter, setActiveCapabilityFilter] = useState<string | null>(null);

  // Data fetching
  useEffect(() => {
    fetch('/ollama.json')
      .then(res => res.json())
      .then((data: ApiResponse) => setModels(data.models || []))
      .catch(() => console.log('No data found'))
      .finally(() => setInitialLoading(false));
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

  // No models found state
  if (models.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center">
        <div className="text-center px-6 py-16 max-w-md mx-auto">
          <div className="inline-block rounded-full bg-slate-800 p-6 mb-6 shadow-lg shadow-slate-900/50">
            <Brain className="h-16 w-16 text-slate-300 opacity-50" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">No Models Found</h1>
          <p className="text-slate-300 mb-8 leading-relaxed">
            No model data is currently available. Try running the scraper API endpoint to gather model information.
          </p>
          <Button 
            className="bg-blue-500 hover:bg-blue-600 transition-colors"
            onClick={() => window.location.href = '/api/scrape?save=true'}
          >
            Run Scraper
          </Button>
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-3">
        <div className="w-full mx-auto">
          {/* Search */}
          <div className="mb-2">
            
            <div className="w-full max-w-xl mx-auto relative mb-2">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                <Search className="h-5 w-5" />
              </div>
              <Input
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-9 text-sm bg-zinc-900 border-zinc-800 text-white rounded-md shadow-lg focus-visible:ring-1 focus-visible:ring-white focus-visible:border-transparent"
              />
            </div>
            
            {/* Capability filters */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mb-2">
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
            
            {/* Stats */}
            <div className="text-center text-xs text-zinc-500 mb-1">
              Showing {filteredAndSortedModels.length} of {models.length} models
              {activeCapabilityFilter && (
                <span> • Filtered by <span className="text-white capitalize">{activeCapabilityFilter}</span></span>
              )}
            </div>
          </div>

          {/* Table */}
          {filteredAndSortedModels.length > 0 ? (
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
          ) : (
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
          )}
          
          {/* Footer */}
          <div className="mt-8 text-center text-sm text-zinc-600">
            <p>Data automatically loaded from cached source</p>
          </div>
        </div>
      </div>
    </div>
  );
}
