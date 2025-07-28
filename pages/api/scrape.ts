import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import * as cheerio from 'cheerio';

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

async function fetchModelDetails(url: string): Promise<ModelVersion[]> {
  try {
    const { data } = await axios.get(`https://ollama.com${url}`);
    const $ = cheerio.load(data);
    const versions: ModelVersion[] = [];

    // Process both mobile and desktop views
    $('a[href^="/library/"]').each((_, element) => {
      const $el = $(element);
      const href = $el.attr('href');
      
      // Skip if not a model version link
      if (!href || !href.includes(':')) return;

      // For mobile view
      if ($el.hasClass('sm:hidden')) {
        const name = $el.find('p.font-medium').first().text().trim();
        const infoText = $el.find('p.text-neutral-500').first().text().trim().split('·').map(s => s.trim());
        
        if (infoText.length >= 3) {
          versions.push({
            name,
            size: infoText[0],
            context: infoText[1].replace('context window', '').trim(),
            input: infoText[2],
            updated: infoText[3] || '',
            isLatest: $el.find('span.border-blue-500').length > 0,
            url: `https://ollama.com${href}`
          });
        }
      }
      // For desktop view
      else if ($el.closest('div.hidden.sm:grid').length > 0) {
        const $row = $el.closest('div.hidden.sm:grid');
        const name = $row.find('a[href^="/library/"]').first().text().trim();
        const cells = $row.find('p.text-neutral-500');
        
        if (cells.length >= 3) {
          // Try to find the updated time in the row
          let updated = '';
          const updatedEl = $row.find('span[x-test-updated]');
          if (updatedEl.length) {
            updated = updatedEl.text().trim();
          }
          
          versions.push({
            name,
            size: cells.eq(0).text().trim(),
            context: cells.eq(1).text().trim(),
            input: cells.eq(2).text().trim(),
            updated,
            isLatest: $row.find('span.border-blue-500').length > 0,
            url: `https://ollama.com${href}`
          });
        }
      }
    });

    // Remove duplicates by name
    const uniqueVersions = versions.filter((v, i, self) => 
      i === self.findIndex(t => t.name === v.name)
    );

    return uniqueVersions;
  } catch (error) {
    console.error(`Error fetching model details from ${url}:`, error);
    return [];
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ models: ModelData[] } | { error: string }>
) {
  try {
    // Fetch the HTML content from the target URL
    const { data } = await axios.get('https://ollama.com/search');
    
    // Load the HTML into Cheerio
    const $ = cheerio.load(data);
    
    // Initialize array to store model data
    const models: ModelData[] = [];
    
    // Find all model list items
    $('li[x-test-model]').each((_, element) => {
      const $el = $(element);
      
      // Extract model name
      const name = $el.find('[x-test-search-response-title]').text().trim();
      
      // Extract URL
      const url = $el.find('a').attr('href') || '';
      
      // Extract description
      const description = $el.find('p:not([class*="space-x-5"])').first().text().trim();
      
      // Extract capabilities
      const capabilities: string[] = [];
      $el.find('[x-test-capability]').each((_, cap) => {
        capabilities.push($(cap).text().trim());
      });
      
      // Extract pulls count
      const pulls = $el.find('[x-test-pull-count]').text().trim();
      
      // Extract tags count
      const tags = $el.find('[x-test-tag-count]').text().trim();
      
      // Extract last updated time
      const updated = $el.find('[x-test-updated]').text().trim();
      
      // Add model data to array (fetch details in parallel for better performance)
      models.push({
        name,
        url: `https://ollama.com${url}`, // Convert to full URL
        description,
        capabilities,
        pulls,
        tags,
        updated,
        versions: [] // Will be populated after all models are collected
      });
    });
    
    // Fetch details for all models in parallel
    const modelsWithDetails = await Promise.all(models.map(async (model) => {
      const versions = await fetchModelDetails(model.url.replace('https://ollama.com', ''));
      return {
        ...model,
        versions
      };
    }));
    
    // Return the models data with details in the response
    res.status(200).json({ models: modelsWithDetails });
  } catch (error) {
    console.error('Error scraping website:', error);
    res.status(500).json({ error: 'Failed to scrape website' });
  }
}
