import { ModelData, ModelVersion } from './types';

// Rate limiting utility for client-side requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchModelDetails(url: string): Promise<ModelVersion[]> {
  try {
    // Use our proxy API to avoid CORS issues
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(`https://ollama.com${url}`)}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const versions: ModelVersion[] = [];

    // Process mobile view (sm:hidden elements)
    const mobileElements = doc.querySelectorAll('a[href^="/library/"].sm\\:hidden');
    mobileElements.forEach((element) => {
      const href = element.getAttribute('href');
      
      // Skip if not a model version link
      if (!href || !href.includes(':')) return;

      const nameEl = element.querySelector('p.font-medium');
      const infoEl = element.querySelector('p.text-neutral-500');
      const name = nameEl?.textContent?.trim() || '';
      const infoText = infoEl?.textContent?.trim() || '';
      
      if (infoText) {
        // Parse the info text: "5.2GB · 128K context window · Text · 1 month ago"
        const parts = infoText.split('·').map(s => s.trim());
        
        if (parts.length >= 3) {
          // Check if this version is marked as latest
          const isLatest = element.querySelector('span.border-blue-500') !== null;
          
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
    const desktopElements = doc.querySelectorAll('div.hidden.group');
    desktopElements.forEach((element) => {
      // Check if this is a grid row with model version data
      if (!element.classList.contains('sm:grid') || !element.classList.contains('sm:grid-cols-12')) return;
      
      const link = element.querySelector('a[href^="/library/"]');
      const href = link?.getAttribute('href');
      
      if (!href || !href.includes(':')) return;
      
      const name = link?.textContent?.trim() || '';
      const cells = element.querySelectorAll('p.text-neutral-500');
      
      if (cells.length >= 3) {
        // Check if this version is marked as latest
        const isLatest = element.querySelector('span.border-blue-500') !== null;
        
        versions.push({
          name,
          size: cells[0]?.textContent?.trim() || '',
          context: cells[1]?.textContent?.trim() || '',
          input: cells[2]?.textContent?.trim() || '',
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

export async function scrapeOllamaModels(
  limit: number = Infinity,
  onProgress?: (message: string, current?: number, total?: number) => void
): Promise<ModelData[]> {
  try {
    onProgress?.('🚀 Starting scrape from Ollama.com');
    
    // Fetch the main search page via our proxy
    onProgress?.('🌐 Fetching main page from ollama.com');
    const proxyUrl = `/api/proxy?url=${encodeURIComponent('https://ollama.com/search')}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    onProgress?.('✅ Retrieved model list page');
    
    // Parse HTML using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find all model elements
    const modelElements = doc.querySelectorAll('li[x-test-model]');
    const totalModelsFound = modelElements.length;
    const processLimit = Math.min(limit, totalModelsFound);
    
    onProgress?.(`📋 Found ${totalModelsFound} models, processing ${processLimit}`);
    
    const models: ModelData[] = [];
    let processedCount = 0;

    // Process each model
    for (let i = 0; i < Math.min(modelElements.length, limit); i++) {
      const element = modelElements[i];
      processedCount++;

      // Extract model name
      const nameEl = element.querySelector('[x-test-search-response-title]');
      const name = nameEl?.textContent?.trim() || '';
      
      if (processedCount % 5 === 0 || processedCount <= 3) {
        onProgress?.(`🔍 Processing model: ${name}`, processedCount, processLimit);
      }
      
      // Extract URL
      const linkEl = element.querySelector('a');
      const url = linkEl?.getAttribute('href') || '';
      
      // Extract description
      const descEl = element.querySelector('p:not([class*="space-x-5"])');
      const description = descEl?.textContent?.trim() || '';
      
      // Extract capabilities
      const capabilities: string[] = [];
      const capElements = element.querySelectorAll('[x-test-capability]');
      capElements.forEach(cap => {
        const text = cap.textContent?.trim();
        if (text) capabilities.push(text);
      });
      
      // Extract pulls count
      const pullsEl = element.querySelector('[x-test-pull-count]');
      const pulls = pullsEl?.textContent?.trim() || '';
      
      // Extract tags count  
      const tagsEl = element.querySelector('[x-test-tag-count]');
      const tags = tagsEl?.textContent?.trim() || '';
      
      // Extract last updated time
      const updatedEl = element.querySelector('[x-test-updated]');
      const updated = updatedEl?.textContent?.trim() || '';
      
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
    }
    
    onProgress?.(`🔄 Fetching detailed info for ${models.length} models`);
    
    // Fetch model details with higher concurrency for client-side scraping
    const concurrencyLimit = 8; // Increased from 2 to 8 for faster scraping
    let completedDetails = 0;
    
    for (let i = 0; i < models.length; i += concurrencyLimit) {
      const batch = models.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async (model) => {
        try {
          const versions = await fetchModelDetails(model.url.replace('https://ollama.com', ''));
          completedDetails++;
          
          if (completedDetails % 3 === 0 || completedDetails <= 2) {
            onProgress?.(`✨ Got details for ${model.name} (${completedDetails}/${models.length})`, completedDetails, models.length);
          }
          
          return {
            ...model,
            versions
          };
        } catch (error: any) {
          onProgress?.(`⚠️ Failed to get details for ${model.name}: ${error.message}`);
          completedDetails++;
          // Return model without versions if detail fetch fails
          return {
            ...model,
            versions: []
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Update the original models array with results
      for (let j = 0; j < batchResults.length; j++) {
        models[i + j] = batchResults[j];
      }
      
      // Shorter delay between batches for faster processing
      if (i + concurrencyLimit < models.length) {
        await delay(200); // Reduced from 1000ms to 200ms
      }
    }
    
    onProgress?.(`🎉 Scraping completed! Found ${models.length} models`);
    return models;
    
  } catch (error: any) {
    onProgress?.(`❌ Scraping failed: ${error.message}`);
    throw error;
  }
}