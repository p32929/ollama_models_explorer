import type { NextApiRequest, NextApiResponse } from 'next';
import { dataCache } from '@/lib/dataCache';
import { ApiResponse } from '@/lib/types';

interface ApiError {
  error: string;
  message: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse | ApiError>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only GET requests are supported'
    });
  }

  try {
    const cachedData = dataCache.get();

    // If no cached data exists, return empty response with instruction
    if (!cachedData) {
      return res.status(200).json({
        models: [],
        lastUpdated: undefined,
        cacheAgeMinutes: undefined,
        limit: undefined
      });
    }

    // Return cached data with metadata
    const response: ApiResponse = {
      models: cachedData.models,
      lastUpdated: cachedData.lastUpdated.toISOString(),
      cacheAgeMinutes: dataCache.getAgeInMinutes(),
      limit: cachedData.limit,
      status: cachedData.status
    };

    // Set cache headers (cache for 5 minutes on client side)
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Error serving models data:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to retrieve models data'
    });
  }
}