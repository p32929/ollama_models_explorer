import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, hx } = req.query;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Only allow ollama.com requests for security
  if (!url.startsWith('https://ollama.com/')) {
    return res.status(403).json({ error: 'Only ollama.com URLs are allowed' });
  }

  try {
    console.log(`🌐 [PROXY] Fetching: ${url}`);
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; OllamaExplorer/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive'
    };

    // ollama.com serves its paginated search results as htmx fragments and
    // redirects (303) to page 1 unless the request is marked as an htmx request.
    if (hx === '1') {
      headers['HX-Request'] = 'true';
    }

    const response = await fetch(url, { headers, redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Unexpected redirect (HTTP ${response.status}) from ${url}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`✅ [PROXY] Successfully fetched ${Math.round(html.length / 1024)}KB from ${url}`);
    
    // Return HTML with proper CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'text/html');
    
    res.status(200).send(html);
    
  } catch (error: any) {
    console.error(`❌ [PROXY] Failed to fetch ${url}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch URL',
      details: error.message 
    });
  }
}