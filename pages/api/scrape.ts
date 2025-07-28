import type { NextApiRequest, NextApiResponse } from 'next';
import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { promises as fs } from 'fs';
import path from 'path';

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ models: ModelData[]; limit?: number } | { error: string }>
) {
  try {
    // Fetch the HTML content from the target URL
    const { data } = await axios.get('https://ollama.com/search');
    
    // Load the HTML into Cheerio
    const $ = cheerio.load(data);
    
    // Initialize array to store model data
    const models: ModelData[] = [];
    
    // Get limit from query parameter, default to Infinity if not provided or invalid
    const limit = req.query.limit ? Math.max(1, parseInt(req.query.limit as string) || Infinity) : Infinity;
    let processedCount = 0;
    
    // Find model list items up to the limit
    $('li[x-test-model]').each((_: number, element) => {
      // Stop processing if we've reached the limit
      if (processedCount >= limit) return false; // Returning false breaks the each loop
      
      processedCount++;
      const $el = $(element);
      
      // Extract model name
      const name = $el.find('[x-test-search-response-title]').text().trim();
      
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
    
    // Set up rate limiting (max 3 concurrent requests)
    const concurrencyLimit = pLimit(3);
    
    // Create an array of promises with rate limiting, only up to the limit
    const modelDetailPromises = models.slice(0, limit).map(model => 
      concurrencyLimit(() => 
        fetchModelDetails(model.url.replace('https://ollama.com', ''))
          .then(versions => ({
            ...model,
            versions
          }))
      )
    );
    
    // Wait for all model details to be fetched with rate limiting
    const modelsWithDetails = await Promise.all(modelDetailPromises);
    
    // Ensure we have valid data before sending response
    if (!modelsWithDetails || !Array.isArray(modelsWithDetails)) {
      throw new Error('Failed to fetch model details');
    }
    
    // Return the models data with details in the response
    const response = { 
      models: modelsWithDetails,
      limit: limit < Infinity ? limit : undefined
    };
    
    // Save to file if save=true is in the query parameters
    if (req.query.save === 'true') {
      try {
        const publicDir = path.join(process.cwd(), 'public');
        const filePath = path.join(publicDir, 'ollama.json');
        
        // Ensure public directory exists
        await fs.mkdir(publicDir, { recursive: true });
        
        // Write the data to the file
        await fs.writeFile(filePath, JSON.stringify(response, null, 2), 'utf8');
        console.log(`Data saved to ${filePath}`);
      } catch (error) {
        console.error('Error saving data to file:', error);
        // Don't fail the request if file save fails
      }
    }
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error scraping website:', error);
    res.status(500).json({ error: 'Failed to scrape website' });
  }
}
