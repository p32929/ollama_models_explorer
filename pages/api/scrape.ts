import type { NextApiRequest, NextApiResponse } from 'next';

import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { dataCache } from '@/lib/dataCache';
import { ModelData, ModelVersion } from '@/lib/types';

async function fetchModelDetails(url: string): Promise<ModelVersion[]> {
  try {
    const response = await fetch(`https://ollama.com${url}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OllamaExplorer/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.text();
    const $ = cheerio.load(data);
    const versions: ModelVersion[] = [];

    // Process mobile view (sm:hidden elements)
    $('a[href^="/library/"].sm\\:hidden').each((_: number, element) => {
      const $el = $(element);
      const href = $el.attr('href');
      
      // Skip if not a model version link
      if (!href || !href.includes(':')) return;

      const name = $el.find('p.font-medium').first().text().trim();
      const infoText = $el.find('p.text-neutral-500').first().text().trim();
      
      if (infoText) {
        // Parse the info text: "5.2GB · 128K context window · Text · 1 month ago"
        const parts = infoText.split('·').map((s: string) => s.trim());
        
        if (parts.length >= 3) {
          // Check if this version is marked as latest
          const isLatest = $el.find('span.border-blue-500').length > 0;
          
          versions.push({
            name,
            size: parts[0],
            context: parts[1].replace('context window', '').trim(),
            input: parts[2],
            updated: parts[3] || '',
            isLatest,
            url: `https://ollama.com${href}`
          });
        }
      }
    });

    // Process desktop view (hidden sm:grid elements)
    $('div.hidden.group').each((_: number, element) => {
      const $row = $(element);
      
      // Check if this is a grid row with model version data
      if (!$row.hasClass('sm:grid') || !$row.hasClass('sm:grid-cols-12')) return;
      
      const $link = $row.find('a[href^="/library/"]').first();
      const href = $link.attr('href');
      
      if (!href || !href.includes(':')) return;
      
      const name = $link.text().trim();
      const cells = $row.find('p.text-neutral-500');
      
      if (cells.length >= 3) {
        // Check if this version is marked as latest
        const isLatest = $row.find('span.border-blue-500').length > 0;
        
        versions.push({
          name,
          size: cells.eq(0).text().trim(),
          context: cells.eq(1).text().trim(),
          input: cells.eq(2).text().trim(),
          updated: '', // Updated time is not in the desktop grid, get from mobile view
          isLatest,
          url: `https://ollama.com${href}`
        });
      }
    });

    // If we have both mobile and desktop versions, merge them (prefer mobile for updated time)
    const mergedVersions: { [key: string]: ModelVersion } = {};
    
    versions.forEach(version => {
      if (mergedVersions[version.name]) {
        // Merge data, preferring non-empty values
        mergedVersions[version.name] = {
          ...mergedVersions[version.name],
          ...version,
          updated: version.updated || mergedVersions[version.name].updated
        };
      } else {
        mergedVersions[version.name] = version;
      }
    });

    return Object.values(mergedVersions);
  } catch (error) {
    console.error(`Error fetching model details from ${url}:`, error);
    return [];
  }
}

// Background scraping function
async function performScraping(limit: number = Infinity) {
  const startTime = Date.now();
  console.log(`📋 [SCRAPE-START] Beginning scrape process at ${new Date().toISOString()} (limit: ${limit === Infinity ? 'unlimited' : limit})`);
  
  try {
    dataCache.addLog('🚀 Starting scrape from Ollama.com', 'info');
    dataCache.updateProgress(0, 100, 'Fetching model list');
    
    console.log(`🌐 [FETCH] Requesting https://ollama.com/search`);
    dataCache.addLog('🌐 Fetching main page from ollama.com', 'info');
    
    console.log(`🔧 [DEBUG] Starting network request`);
    dataCache.addLog('🔧 Starting network request', 'info');
    
    // Create a progress tracking function
    let isRequestComplete = false;
    const trackProgress = async () => {
      let progressCount = 0;
      while (!isRequestComplete) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        if (!isRequestComplete) {
          progressCount++;
          console.log(`⏳ [PROGRESS-${progressCount}] Still fetching main page... (${progressCount * 5}s elapsed)`);
          dataCache.addLog(`⏳ Still fetching main page... (${progressCount * 5}s elapsed)`, 'info');
        }
      }
    };
    
    // Start progress tracking in background
    trackProgress();
    
    let data;
    try {
      console.log(`⏱️ [FETCH] Starting fetch request at ${new Date().toISOString()}`);
      dataCache.addLog('⏱️ Starting HTTP request to ollama.com', 'info');
      
      // First, try a simple connectivity test
      console.log(`🔍 [DIAG] Testing basic connectivity...`);
      dataCache.addLog('🔍 Testing connectivity to ollama.com', 'info');
      
      try {
        // Test with a simpler endpoint first
        const testResponse = await fetch('https://ollama.com/', {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; OllamaExplorer/1.0)'
          }
        });
        console.log(`✅ [DIAG] Basic connectivity test passed (${testResponse.status})`);
        dataCache.addLog(`✅ Basic connectivity OK (${testResponse.status})`, 'info');
      } catch (testError: any) {
        console.error(`❌ [DIAG] Basic connectivity failed:`, testError);
        dataCache.addLog(`❌ Basic connectivity failed: ${testError.message}`, 'error');
        throw new Error(`Cannot connect to ollama.com: ${testError.message}`);
      }
      
      // Now try the actual search page
      console.log(`🌐 [FETCH] Requesting search page...`);
      dataCache.addLog('🌐 Requesting search page', 'info');
      
      const response = await fetch('https://ollama.com/search', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OllamaExplorer/1.0)'
        }
      });
      
      console.log(`⏱️ [FETCH] Fetch request completed at ${new Date().toISOString()}`);
      isRequestComplete = true;
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      data = await response.text();
      console.log(`✅ [FETCH] Successfully received response (status: ${response.status})`);
      dataCache.addLog(`✅ Got response from ollama.com (${response.status})`, 'success');
    } catch (fetchError: any) {
      isRequestComplete = true;
      console.error(`❌ [FETCH-ERROR] Failed to fetch ollama.com:`, fetchError);
      dataCache.addLog(`❌ Failed to fetch ollama.com: ${fetchError.message}`, 'error');
      throw fetchError;
    }
    

    
    console.log(`✅ [FETCH] Received ${Math.round(data.length / 1024)}KB of HTML data`);
    dataCache.addLog('✅ Retrieved model list page', 'success');
    dataCache.updateProgress(20, 100, 'Parsing model list');
    
    // Load the HTML into Cheerio
    const $ = cheerio.load(data);
    
    // Initialize array to store model data
    const models: ModelData[] = [];
    let processedCount = 0;
    
    // Find model list items up to the limit
    const totalModelsFound = $('li[x-test-model]').length;
    const processLimit = Math.min(limit, totalModelsFound);
    console.log(`📋 [PARSE] Found ${totalModelsFound} models on page, will process ${processLimit}`);
    dataCache.addLog(`📋 Found ${totalModelsFound} models on page`, 'info');
    dataCache.updateProgress(30, 100, `Processing ${processLimit} models`);
    
    $('li[x-test-model]').each((_: number, element) => {
      // Stop processing if we've reached the limit
      if (processedCount >= limit) return false;
      
      processedCount++;
      const $el = $(element);

      // Extract model name
      const name = $el.find('[x-test-search-response-title]').text().trim();
      
      if (processedCount % 5 === 0 || processedCount <= 3) {
        dataCache.addLog(`🔍 Processing model: ${name}`, 'info');
      }
      
      // Extract URL
      const url = $el.find('a').attr('href') || '';
      
      // Extract description
      const description = $el.find('p:not([class*="space-x-5"])').first().text().trim();
      
      // Extract capabilities
      const capabilities: string[] = [];
      $el.find('[x-test-capability]').each((_: number, cap) => {
        capabilities.push($(cap).text().trim());
      });
      
      // Extract pulls count
      const pulls = $el.find('[x-test-pull-count]').text().trim();
      
      // Extract tags count
      const tags = $el.find('[x-test-tag-count]').text().trim();
      
      // Extract last updated time
      const updated = $el.find('[x-test-updated]').text().trim();
      
      // Add model data to array
      models.push({
        name,
        url: `https://ollama.com${url}`,
        description,
        capabilities,
        pulls,
        tags,
        updated,
        versions: []
      });
    });
    
    // Set up rate limiting (reduce to 2 concurrent requests for Vercel)
    const concurrencyLimit = pLimit(2);
    
    console.log(`🔄 [DETAILS] Starting parallel fetch for ${models.length} models (2 concurrent)`);
    dataCache.addLog(`🔄 Fetching detailed info for ${models.length} models`, 'info');
    dataCache.updateProgress(50, 100, 'Fetching model details');
    
    let completedDetails = 0;
    
    // Create an array of promises with rate limiting and error handling
    const modelDetailPromises = models.slice(0, limit).map((model, index) => 
      concurrencyLimit(async () => {
        try {
          const versions = await fetchModelDetails(model.url.replace('https://ollama.com', ''));
          completedDetails++;
          
          if (completedDetails % 3 === 0 || completedDetails <= 2) {
            dataCache.addLog(`✨ Got details for ${model.name} (${completedDetails}/${models.length})`, 'success');
            dataCache.updateProgress(50 + (completedDetails / models.length) * 40, 100, `Processing ${model.name}`);
          }
          
          return {
            ...model,
            versions
          };
        } catch (error: any) {
          dataCache.addLog(`⚠️ Failed to get details for ${model.name}: ${error.message}`, 'warning');
          completedDetails++;
          // Return model without versions if detail fetch fails
          return {
            ...model,
            versions: []
          };
        }
      })
    );
    
    // Wait for all model details to be fetched
    const modelsWithDetails = await Promise.all(modelDetailPromises);
    
    // Store completed data in cache
    const elapsed = Date.now() - startTime;
    console.log(`🎉 [SCRAPE-COMPLETE] Successfully scraped ${modelsWithDetails.length} models in ${Math.round(elapsed/1000)}s`);
    dataCache.addLog(`🎉 Scraping completed! Found ${modelsWithDetails.length} models`, 'success');
    dataCache.updateProgress(100, 100, 'Complete');
    
    const responseData = { 
      models: modelsWithDetails,
      limit: limit < Infinity ? limit : undefined,
      status: 'ready' as const,
      logs: dataCache.get()?.logs || []
    };

    dataCache.set(responseData);
    console.log(`✅ [CACHE] Stored ${modelsWithDetails.length} models in memory at ${new Date().toISOString()}`);
    
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`💥 [SCRAPE-ERROR] Scraping failed after ${Math.round(elapsed/1000)}s:`, error);
    dataCache.addLog(`❌ Scraping failed: ${error.message}`, 'error');
    console.error('❌ [SCRAPE-ERROR] Full error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.status,
      url: error.config?.url
    });
    // Clear pending status on error
    const currentData = dataCache.get();
    if (currentData) {
      dataCache.set({ ...currentData, status: 'ready' });
    }
  }
}

// Timeout wrapper to prevent Vercel timeout
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ message: string; status: string } | { error: string }>
) {
  try {
    // Get limit from query parameter
    const limit = req.query.limit ? Math.max(1, parseInt(req.query.limit as string) || Infinity) : Infinity;
    
    // Set cache to pending status immediately
    dataCache.setPending();
    
    // Respond immediately
    res.status(200).json({
      message: 'Scraping started in background',
      status: 'pending'
    });
    
    // Start background scraping with timeout (don't await - fire and forget)
    console.log(`🚀 Starting background scraping (limit: ${limit === Infinity ? 'unlimited' : limit}) at ${new Date().toISOString()}`);
    dataCache.addLog(`🚀 Background scraping started (limit: ${limit === Infinity ? 'unlimited' : limit})`, 'info');
    
    withTimeout(performScraping(limit), 15000)
      .then(() => {
        console.log(`✅ Background scraping completed successfully at ${new Date().toISOString()}`);
      })
      .catch(error => {
        const isTimeout = error.message === 'Operation timeout';
        if (isTimeout) {
          console.log(`⏰ Timeout watchdog triggered after 15s at ${new Date().toISOString()}, but scraping continues in background`);
          dataCache.addLog('⏰ Watchdog timeout reached (15s) - scraping continues in background', 'info');
          // Check if scraping actually completes later
          setTimeout(() => {
            const currentData = dataCache.get();
            if (currentData && currentData.status === 'ready') {
              console.log(`✅ Scraping completed successfully after watchdog timeout`);
              dataCache.addLog('✅ Scraping completed successfully (took longer than 15s)', 'success');
            } else if (currentData && currentData.status === 'pending') {
              console.log(`⏳ Scraping still in progress after watchdog timeout + 5s`);
              dataCache.addLog('⏳ Scraping still in progress (taking longer than expected)', 'warning');
            }
          }, 5000);
        } else {
          console.error(`❌ Background scraping failed with error:`, error);
          dataCache.addLog(`❌ Scraping failed: ${error.message}`, 'error');
        }
      });
    

    
  } catch (error) {
    console.error('Error starting scrape:', error);
    res.status(500).json({ error: 'Failed to start scraping' });
  }
}
