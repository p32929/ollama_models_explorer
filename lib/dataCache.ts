import { ModelData, CachedData, ScrapingLog } from './types';

// In-memory cache
let cachedModels: CachedData | null = null;

export const dataCache = {
  // Get cached data
  get(): CachedData | null {
    return cachedModels;
  },

  // Set new data in cache
  set(data: { models: ModelData[]; limit?: number; status?: 'ready' | 'pending'; logs?: ScrapingLog[]; progress?: any }): void {
    cachedModels = {
      ...data,
      lastUpdated: new Date(),
      status: data.status || 'ready',
      logs: data.logs || []
    };
  },

  // Set pending status
  setPending(): void {
    if (cachedModels) {
      cachedModels.status = 'pending';
      cachedModels.logs = [];
    } else {
      cachedModels = {
        models: [],
        lastUpdated: new Date(),
        status: 'pending',
        logs: []
      };
    }
  },

  // Add log entry
  addLog(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const log: ScrapingLog = {
      timestamp: new Date(),
      message,
      type
    };
    
    if (cachedModels) {
      cachedModels.logs = [...(cachedModels.logs || []), log].slice(-20); // Keep last 20 logs
    }
  },

  // Update progress
  updateProgress(current: number, total: number, currentTask: string): void {
    if (cachedModels) {
      cachedModels.progress = { current, total, currentTask };
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