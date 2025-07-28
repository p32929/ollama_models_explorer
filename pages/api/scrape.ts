import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Fetch the HTML content from the target URL
    const { data } = await axios.get('https://ollama.com/search');
    
    // Load the HTML into Cheerio
    const $ = cheerio.load(data);
    
    // Extract the title
    const title = $('title').text().trim();
    
    // Return the title in the response
    res.status(200).json({ title });
  } catch (error) {
    console.error('Error scraping website:', error);
    res.status(500).json({ error: 'Failed to scrape website' });
  }
}
