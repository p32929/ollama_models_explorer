import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download, RefreshCw } from 'lucide-react';

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

export default function Home() {
  const [models, setModels] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [hasExistingData, setHasExistingData] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load existing data from ollama.json if available
  const loadExistingData = async () => {
    try {
      const response = await fetch('/ollama.json');
      
      if (response.ok) {
        const data: ApiResponse = await response.json();
        setModels(data.models);
        setLimit(data.limit);
        setHasExistingData(true);
        setError(null);
      } else {
        setHasExistingData(false);
      }
    } catch (err) {
      setHasExistingData(false);
      console.log('No existing data found, will show load buttons');
    } finally {
      setInitialLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    loadExistingData();
  }, []);

  const fetchModels = async (limitParam?: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const url = limitParam 
        ? `/api/scrape?limit=${limitParam}`
        : '/api/scrape';
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }
      
      const data: ApiResponse = await response.json();
      setModels(data.models);
      setLimit(data.limit);
      setHasExistingData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleScrapeAndSave = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/scrape?save=true');
      
      if (!response.ok) {
        throw new Error('Failed to scrape and save models');
      }
      
      const data: ApiResponse = await response.json();
      setModels(data.models);
      setLimit(data.limit);
      setHasExistingData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshData = () => {
    setInitialLoading(true);
    setModels([]);
    setHasExistingData(false);
    loadExistingData();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Ollama Models</h1>
          <p className="text-muted-foreground mb-6">
            Browse and explore AI models from the Ollama library
          </p>
          
          {/* Action Buttons */}
          <div className="flex gap-4 flex-wrap">
            {hasExistingData ? (
              // Show refresh and update buttons when data exists
              <>
                <Button 
                  onClick={handleRefreshData} 
                  disabled={loading || initialLoading}
                  variant="outline"
                >
                  {initialLoading ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh Data
                </Button>
                
                <Button 
                  onClick={handleScrapeAndSave} 
                  disabled={loading || initialLoading}
                  variant="default"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Update & Save
                </Button>
                
                <Button 
                  onClick={() => fetchModels()} 
                  disabled={loading || initialLoading}
                  variant="secondary"
                >
                  Fetch All Models
                </Button>
              </>
            ) : (
              // Show initial load buttons when no data exists
              <>
                <Button 
                  onClick={() => fetchModels()} 
                  disabled={loading || initialLoading}
                  variant="default"
                >
                  {loading ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Load All Models
                </Button>
                
                <Button 
                  onClick={() => fetchModels(5)} 
                  disabled={loading || initialLoading}
                  variant="outline"
                >
                  Load 5 Models
                </Button>
                
                <Button 
                  onClick={() => fetchModels(1)} 
                  disabled={loading || initialLoading}
                  variant="outline"
                >
                  Load 1 Model
                </Button>
                
                <Button 
                  onClick={handleScrapeAndSave} 
                  disabled={loading || initialLoading}
                  variant="secondary"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Scrape & Save
                </Button>
              </>
            )}
          </div>
          
          {/* Stats */}
          {models.length > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Showing {models.length} model{models.length !== 1 ? 's' : ''}
                {limit && ` (limited to ${limit})`}
              </div>
              {hasExistingData && (
                <Badge variant="secondary" className="text-xs">
                  Loaded from cache
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Error State */}
        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">Error: {error}</p>
            </CardContent>
          </Card>
        )}

        {/* Initial Loading State */}
        {initialLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin" />
            <span className="ml-2">Checking for existing data...</span>
          </div>
        )}

        {/* Loading State */}
        {loading && !initialLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading models...</span>
          </div>
        )}

        {/* Models Grid */}
        {!loading && !initialLoading && models.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {models.map((model, index) => (
              <Card key={index} className="h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">{model.name}</CardTitle>
                      <CardDescription className="text-sm line-clamp-3">
                        {model.description}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <a href={model.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent>
                  {/* Capabilities */}
                  {model.capabilities.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium mb-2">Capabilities:</p>
                      <div className="flex flex-wrap gap-1">
                        {model.capabilities.map((capability, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-muted-foreground">Pulls</p>
                      <p className="font-mono">{model.pulls}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Tags</p>
                      <p className="font-mono">{model.tags}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 text-sm">
                    <p className="font-medium text-muted-foreground">Updated</p>
                    <p>{model.updated}</p>
                  </div>
                  
                  {/* Versions */}
                  {model.versions.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-2">
                        Versions ({model.versions.length})
                      </p>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {model.versions.slice(0, 3).map((version, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{version.name}</span>
                              {version.isLatest && (
                                <Badge variant="default" className="text-xs px-1 py-0">
                                  latest
                                </Badge>
                              )}
                            </div>
                            <span className="text-muted-foreground">{version.size}</span>
                          </div>
                        ))}
                        {model.versions.length > 3 && (
                          <p className="text-xs text-muted-foreground text-center">
                            +{model.versions.length - 3} more versions
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !initialLoading && models.length === 0 && !error && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No models found</p>
              <p className="text-sm text-muted-foreground mb-4">
                No cached data available. Click below to load models from Ollama.
              </p>
              <Button onClick={() => fetchModels()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Load Models
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
