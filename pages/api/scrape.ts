import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface ModelData {
  name: string;
  description: string;
  capabilities: string[];
  pulls: string;
  tags: string;
  updated: string;
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
      
      // Add model data to array
      models.push({
        name,
        description,
        capabilities,
        pulls,
        tags,
        updated
      });
    });
    
    // Return the models data in the response
    res.status(200).json({ models });
  } catch (error) {
    console.error('Error scraping website:', error);
    res.status(500).json({ error: 'Failed to scrape website' });
  }
}
