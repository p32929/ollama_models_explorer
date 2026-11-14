import { test, expect } from '@playwright/test';

test('JSON API: search, filter, sort and page', async ({ request }) => {
  const res = await request.get('/api/v1/models?q=qwen&scope=community&sort=downloads&order=desc&limit=5');
  expect(res.status()).toBe(200);
  expect(res.headers()['access-control-allow-origin']).toBe('*');
  const body = await res.json();
  expect(body.total).toBeGreaterThan(5);
  expect(body.count).toBe(5);
  expect(body.models.every((m: any) => m.name.includes('/') && m.official === false)).toBe(true);
  const downloads = body.models.map((m: any) => m.downloads);
  expect([...downloads].sort((a, b) => b - a)).toEqual(downloads);
  expect(Object.keys(body.models[0])).toEqual(expect.arrayContaining(['name', 'url', 'publisher', 'description', 'capabilities', 'downloads', 'updated']));

  const page2 = await (await request.get('/api/v1/models?q=qwen&scope=community&sort=downloads&limit=5&offset=5')).json();
  expect(page2.models[0].name).not.toBe(body.models[0].name);
  const official = await (await request.get('/api/v1/models?scope=official&limit=500')).json();
  expect(official.total).toBeGreaterThan(200);
  expect(official.models.every((m: any) => m.official)).toBe(true);
});

test('JSON API: limit is capped, bad input is harmless, fit can be requested', async ({ request }) => {
  const big = await (await request.get('/api/v1/models?limit=100000')).json();
  expect(big.count).toBeLessThanOrEqual(500);
  const odd = await request.get('/api/v1/models?sort=hack&limit=abc&offset=-5&scope=nonsense');
  expect(odd.status()).toBe(200);
  const fit = await (await request.get('/api/v1/models?q=llama3.2&scope=official&memory_gb=16&limit=1')).json();
  expect(fit.models[0].fit).toBe('good');
  expect((await request.post('/api/v1/models')).status()).toBe(405);
});

test('RSS feed lists new and updated models', async ({ request }) => {
  const res = await request.get('/feed.xml');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/rss+xml');
  const xml = await res.text();
  expect(xml).toMatch(/^<\?xml version="1.0"/);
  expect(xml).toContain('<rss version="2.0">');
  expect((xml.match(/<item>/g) || []).length).toBeGreaterThan(0);
  expect((xml.match(/<item>/g) || []).length).toBe((xml.match(/<\/item>/g) || []).length);
  expect(xml).not.toMatch(/<description>[^<]*&(?!amp;|lt;|gt;|quot;)/); // everything is escaped
});
