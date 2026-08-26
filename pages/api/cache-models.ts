import type { NextApiRequest, NextApiResponse } from 'next';
import { dataCache } from '@/lib/dataCache';
import { ModelData } from '@/lib/types';

// The full ollama.com catalogue (200+ models, each with every tag) is several
// megabytes of JSON — well past Next.js' 1mb default body limit.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '32mb'
    }
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { models, limit } = req.body as { models: ModelData[], limit?: number };
    
    if (!Array.isArray(models)) {
      return res.status(400).json({ error: 'Invalid models data' });
    }

    console.log(`📦 [CACHE] Storing ${models.length} models from client scraping`);
    
    const responseData = {
      models,
      limit: limit && limit < Infinity ? limit : undefined,
      status: 'ready' as const,
      logs: []
    };

    dataCache.set(responseData);
    
    console.log(`✅ [CACHE] Successfully cached ${models.length} models at ${new Date().toISOString()}`);
    
    res.status(200).json({
      message: `Successfully cached ${models.length} models`,
      status: 'ready'
    });
    
  } catch (error: any) {
    console.error('❌ [CACHE-ERROR] Failed to cache models:', error);
    res.status(500).json({ error: 'Failed to cache models' });
  }
}