import { ModelData, CachedData } from './types';

// In-memory cache
let cachedModels: CachedData | null = null;

export const dataCache = {
  // Get cached data
  get(): CachedData | null {
    return cachedModels;
  },

  // Set new data in cache
  set(data: { models: ModelData[]; limit?: number; status?: 'ready' | 'pending' }): void {
    cachedModels = {
      ...data,
      lastUpdated: new Date(),
      status: data.status || 'ready'
    };
  },

  // Set pending status
  setPending(): void {
    if (cachedModels) {
      cachedModels.status = 'pending';
    } else {
      cachedModels = {
        models: [],
        lastUpdated: new Date(),
        status: 'pending'
      };
    }
  },

  // Clear cache
  clear(): void {
    cachedModels = null;
  },

  // Check if cache exists and is not empty
  hasData(): boolean {
    return cachedModels !== null && cachedModels.models.length > 0;
  },

  // Get cache age in minutes
  getAgeInMinutes(): number {
    if (!cachedModels) return Infinity;
    return Math.floor((Date.now() - cachedModels.lastUpdated.getTime()) / (1000 * 60));
  }
};