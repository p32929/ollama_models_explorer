#!/usr/bin/env node
// Builds public/ollama-catalogue.json: EVERY model listed on ollama.com, official and community.
//
// ollama.com has no "list everything" page. Its search only returns results for a query, 20 per page, and the
// plain /search page shows just the ~270 official models. But a search matches names and descriptions, so
// searching every letter and digit and following every "next page" covers the whole catalogue.
//
//   node scripts/crawl-catalogue.mjs              # full crawl (about 10 to 20 minutes)
//   node scripts/crawl-catalogue.mjs --quick      # just a few queries, to try it out; writes to a temporary file
//   CONCURRENCY=4 DELAY=300 node scripts/crawl-catalogue.mjs
//
// No dependencies. Needs Node 18+.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUICK = process.argv.includes('--quick');
// A quick sample must never replace the real list, so it writes to a temporary file unless told otherwise
const OUT = process.env.OUT || (QUICK
  ? path.join(os.tmpdir(), 'ollama-catalogue-quick.json')
  : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ollama-catalogue.json'));
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const DELAY = Number(process.env.DELAY || 250); // ms between requests of one worker
const UA = 'Mozilla/5.0 (compatible; OllamaExplorerCatalogue/1.0; +https://github.com/p32929/ollama_models_explorer)';

const QUERIES = QUICK
  ? ['qwen', 'huihui', 'abliterated']
  : [...'abcdefghijklmnopqrstuvwxyz0123456789', '-', '_', '.'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

async function get(url, tries = 5) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'HX-Request': 'true', Accept: 'text/html' }, redirect: 'manual' });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i >= tries) throw err;
      await sleep(1000 * i * i);
    }
  }
}

/** One search result <li> -> [path, description, capabilities, downloads, tags, sizes, updated] */
function parseItem(li) {
  const href = /<a href="(\/[^"]+)"/.exec(li)?.[1];
  if (!href) return null;
  const spans = [...li.matchAll(/<span\s+class="([^"]*)"[^>]*>([^<]*)<\/span>/g)].map((m) => ({ cls: m[1], text: decode(m[2]) }));
  const caps = [];
  const sizes = [];
  for (const s of spans) {
    if (!s.cls.includes('rounded-md') || !s.text) continue;
    if (s.cls.includes('text-blue-600') || s.cls.includes('#ddf4ff')) sizes.push(s.text);
    else caps.push(s.text);
  }
  const desc = decode(/<p class="[^"]*line-clamp[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(li)?.[1] || '');
  const pulls = Number((/title="([\d,]+) downloads"/.exec(li)?.[1] || '0').replace(/,/g, ''));
  const tags = Number(/>\s*(\d+) tags?\s*</.exec(li)?.[1] || 0);
  const upd = /title="Updated ([^"]+)"/.exec(li)?.[1];
  const date = upd && !Number.isNaN(Date.parse(upd)) ? new Date(upd + ' UTC').toISOString().slice(0, 10) : '';
  return [href.replace(/^\//, ''), desc.slice(0, 200), caps, pulls, tags, sizes, date];
}

const all = new Map(); // path -> row
let requests = 0;

async function crawlQuery(q) {
  let page = 1;
  let found = 0;
  for (;;) {
    const html = await get(`https://ollama.com/search?page=${page}&q=${encodeURIComponent(q)}`);
    requests++;
    const items = html.split(/<li\s/).slice(1).map((li) => parseItem('<li ' + li)).filter(Boolean);
    if (!items.length) break;
    for (const row of items) {
      // community models are "user/name"; official ones are "library/name" in the link but plain "name" in the listing
      const key = row[0].replace(/^library\//, '');
      row[0] = key;
      if (!all.has(key)) { all.set(key, row); found++; }
    }
    if (!html.includes(`page=${page + 1}`)) break;
    page++;
    await sleep(DELAY);
  }
  console.log(`  "${q}": ${page} pages, ${found} new models (total ${all.size}, ${requests} requests)`);
}

// History: compare with the list we saved last time, so the site can show what is NEW and what is TRENDING.
//   row[7] firstSeen: the day this model first appeared in our list ('' for the models that were there from the start)
//   row[8], row[9]: downloads and date of an older snapshot, to work out how many downloads were gained since
const MIN_SNAPSHOT_GAP_DAYS = 5; // a baseline is replaced only once it is at least this old, so a re-run does not wipe the growth
function addHistory() {
  let prev;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return; }
  if (!prev?.models?.length || prev.partial) return;
  const before = new Map(prev.models.map((r) => [r[0], r]));
  const today = new Date().toISOString().slice(0, 10);
  const prevDate = String(prev.generatedAt || '').slice(0, 10);
  const gapDays = prevDate ? (Date.parse(today) - Date.parse(prevDate)) / 86400000 : 0;
  for (const row of all.values()) {
    const old = before.get(row[0]);
    if (!old) { row[7] = today; continue; } // not in the last list: a new model
    row[7] = old[7] || '';
    if (old[8] && (gapDays < MIN_SNAPSHOT_GAP_DAYS || !prevDate)) { row[8] = old[8]; row[9] = old[9]; } // keep the older baseline
    else { row[8] = old[3]; row[9] = prevDate; } // the last list becomes the baseline
  }
}

function save(partial) {
  if (!partial && !QUICK) addHistory();
  const rows = [...all.values()].sort((a, b) => b[3] - a[3]); // most downloaded first
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, partial: Boolean(partial), models: rows }));
  console.log(`Saved ${rows.length} models to ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
}

process.on('SIGINT', () => { save(true); process.exit(130); });

const queue = [...QUERIES];
const started = Date.now();
console.log(`Crawling ollama.com with ${QUERIES.length} searches, ${CONCURRENCY} at a time...`);
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const q = queue.shift();
    try { await crawlQuery(q); } catch (err) { console.error(`  "${q}" failed: ${err.message}`); }
  }
}));
if (all.size === 0 || (!QUICK && all.size < 5000)) {
  // a failed or cut-short crawl must never replace a good list
  console.error(`Only ${all.size} models found: ollama.com may have changed or blocked us. Not saving.`);
  process.exit(1);
}
save(false);
console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s`);
