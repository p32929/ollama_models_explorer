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
}

export interface ApiResponse {
  models: ModelData[];
  lastUpdated?: string;
  cacheAgeMinutes?: number;
  limit?: number;
  status?: 'ready' | 'pending';
}

export interface CachedData {
  models: ModelData[];
  lastUpdated: Date;
  limit?: number;
  status: 'ready' | 'pending';
}