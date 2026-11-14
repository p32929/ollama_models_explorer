import type { NextApiRequest, NextApiResponse } from 'next';
import { serverModels, generatedAt } from '@/lib/catalogueServer';
import { daysSince } from '@/lib/units';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** RSS feed of the newest and most recently updated Ollama models. Served at /feed.xml. */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const host = req.headers.host || 'ollama-models-explorer.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
  const site = `${proto}://${host}`;
  const fresh = serverModels()
    .filter(m => m.updated && (daysSince(m.firstSeen) <= 30 || daysSince(m.updated) <= 14))
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || (b.pullsCount || 0) - (a.pullsCount || 0))
    .slice(0, 60);
  const items = fresh.map(m => {
    const added = daysSince(m.firstSeen) <= 30;
    const date = new Date(`${m.updated}T12:00:00Z`).toUTCString();
    return `    <item>
      <title>${esc(`${added ? 'New: ' : 'Updated: '}${m.name}`)}</title>
      <link>${esc(m.url)}</link>
      <guid isPermaLink="false">${esc(`${m.name}@${m.updated}`)}</guid>
      <pubDate>${date}</pubDate>
      <description>${esc(`${m.description} ${m.pulls ? `(${m.pulls} downloads)` : ''}`.trim())}</description>
    </item>`;
  }).join('\n');
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Ollama Models Explorer: new and updated models</title>
    <link>${site}</link>
    <description>Models added to or updated on ollama.com recently. List saved ${esc(generatedAt)}.</description>
${items}
  </channel>
</rss>
`);
}
