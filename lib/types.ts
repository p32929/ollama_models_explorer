export interface ModelVersion {
  name: string;
  size: string;
  context: string;
  input: string;
  updated: string;
  isLatest?: boolean;
  url: string;
}

export interface ModelData {
  name: string;
  url: string;
  description: string;
  capabilities: string[];
  pulls: string;
  tags: string;
  updated: string;
  versions: ModelVersion[];
  /** Set for models that come from the full catalogue (or a live search) rather than the detailed official scrape */
  community?: boolean;
  pullsCount?: number;
  tagsCount?: number;
  /** Parameter sizes shown on the search page, e.g. "7b", "70b" */
  sizes?: string[];
}

/** One row of public/ollama-catalogue.json: [path, description, capabilities, downloads, tags, sizes, updated] */
export type CatalogueRow = [string, string, string[], number, number, string[], string];

export interface Catalogue {
  generatedAt: string;
  count: number;
  partial?: boolean;
  models: CatalogueRow[];
}

export interface ScrapingLog {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface ApiResponse {
  models: ModelData[];
  lastUpdated?: string;
  cacheAgeMinutes?: number;
  limit?: number;
  status?: 'ready' | 'pending';
  logs?: ScrapingLog[];
  progress?: {
    current: number;
    total: number;
    currentTask: string;
  };
}

export interface CachedData {
  models: ModelData[];
  lastUpdated: Date;
  limit?: number;
  status: 'ready' | 'pending';
  logs: ScrapingLog[];
  progress?: {
    current: number;
    total: number;
    currentTask: string;
  };
}