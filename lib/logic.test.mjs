// Plain Node tests for the pure logic. Run: node --experimental-strip-types --test lib/logic.test.mjs   (Node 22.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, parseParams, parseContext, daysSince } from './units.ts';
import { estimateDevice } from './device.ts';
import { fitOf, variantsOf } from './fit.ts';
import { applyFilters, DEFAULT_FILTERS, isNewModel } from './filter.ts';
import { filtersToQuery, queryToFilters } from './urlState.ts';
import { TASKS } from './tasks.ts';

const m = (over) => ({ name: 'x', url: '', description: '', capabilities: [], pulls: '', tags: '', updated: '', versions: [], ...over });
const NOW = Date.parse('2026-11-14T12:00:00Z');

test('sizes and counts are parsed', () => {
  assert.equal(parseSize('4.7GB'), 4.7);
  assert.equal(parseSize('338MB'), 0.338);
  assert.equal(parseSize('23GB - 24GB'), 23);
  assert.equal(parseSize('Low Usage'), 0);
  assert.equal(parseParams('7b'), 7);
  assert.equal(parseParams('8x7b'), 56);
  assert.equal(parseParams('600m'), 0.6);
  assert.equal(parseParams('e4b'), 4);
  assert.equal(parseParams('latest'), 0);
  assert.equal(parseContext('32K'), 32);
  assert.equal(parseContext('1M'), 1000);
  assert.equal(daysSince('2026-11-04', NOW), 10);
  assert.equal(daysSince('', NOW), Infinity);
});

test('the computer is estimated from the graphics card, with no input', () => {
  const win = (gpu) => estimateDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Windows', gpu });
  assert.equal(win('ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)').memoryGB, 24);
  assert.equal(win('ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11, D3D11)').memoryGB, 8);
  assert.equal(win('ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11, D3D11)').memoryGB, 24);
  const mac = estimateDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'macOS', gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)' });
  assert.equal(mac.label, 'Apple M3 Max');
  assert.equal(mac.kind, 'unified');
  assert.equal(mac.confidence, 'estimated');
  assert.ok(mac.memoryGB >= 30 && mac.memoryGB <= 40);
  // a Mac whose browser names the maker but not the chip (WebGPU, Safari): must not crash
  const plain = estimateDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'macOS', gpu: 'apple metal-3' });
  assert.equal(plain.kind, 'unified');
  assert.ok(plain.memoryGB > 0);
  const phone = estimateDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', platform: 'iOS' });
  assert.equal(phone.confidence, 'guess');
  assert.equal(estimateDevice({ userAgent: 'x', platform: 'Linux', deviceMemory: 4 }).label, 'this computer (4 GB)');
  assert.ok(estimateDevice({ userAgent: 'x', platform: 'Linux' }).memoryGB > 0, 'always an answer');
});

test('fit: measured sizes for official models, estimates for the rest', () => {
  const official = m({ versions: [{ name: 'a:1b', size: '1.3GB' }, { name: 'a:8b-instruct-q4_K_M', size: '4.9GB' }, { name: 'a:70b', size: '40GB' }].map((v) => ({ ...v, context: '', input: '', updated: '', url: '' })) });
  const f = fitOf(official, 12);
  assert.equal(f.status, 'good');
  assert.equal(f.best.label, '8b');
  assert.equal(f.best.estimated, false);
  assert.equal(fitOf(official, 3).status, 'good'); // the 1b still fits
  assert.equal(fitOf(official, 2.1).status, 'tight'); // the 1b only just fits
  assert.equal(fitOf(official, 1.5).status, 'no');
  const community = m({ sizes: ['7b', '70b'] });
  assert.equal(variantsOf(community)[0].estimated, true);
  assert.equal(fitOf(community, 8).status, 'good');
  assert.equal(fitOf(community, 3).status, 'no');
  assert.equal(fitOf(m({ capabilities: ['cloud'] }), 1).status, 'cloud');
  // a model with local versions AND a cloud version: local wins when something fits, cloud is the fallback
  const both = m({ capabilities: ['cloud'], sizes: ['8b', '70b'] });
  assert.equal(fitOf(both, 16).status, 'good');
  assert.equal(fitOf(both, 2).status, 'cloud');
  assert.equal(fitOf(m({}), 100).status, 'unknown');
});

test('filters: words, scope, owner, size, freshness, duplicates, fit', () => {
  const all = [
    m({ name: 'llama3', description: 'Meta llama model', pullsCount: 900, sizes: ['8b'], updated: '2026-11-10', capabilities: ['tools'] }),
    m({ name: 'bob/llama3-uncensored', description: 'An uncensored llama model by bob that is quite long', pullsCount: 50, sizes: ['8b'], updated: '2025-01-01' }),
    m({ name: 'eve/llama-copy', description: 'An uncensored llama model by bob that is quite long', pullsCount: 5, sizes: ['8b'], updated: '2025-01-01' }),
    m({ name: 'bob/big', description: 'huge', pullsCount: 10, sizes: ['70b'], updated: '2026-11-01', firstSeen: '2026-11-05' }),
  ];
  const run = (o) => applyFilters(all, { ...DEFAULT_FILTERS, ...o }, 16, NOW).models.map(x => x.name);
  assert.deepEqual(run({}), ['llama3', 'bob/llama3-uncensored', 'bob/big', 'eve/llama-copy']); // most downloaded first
  assert.deepEqual(run({ q: 'llama uncensored' }), ['bob/llama3-uncensored', 'eve/llama-copy']);
  assert.deepEqual(run({ scope: 'official' }), ['llama3']);
  assert.deepEqual(run({ scope: 'community', owner: 'BOB' }), ['bob/llama3-uncensored', 'bob/big']);
  assert.deepEqual(run({ maxGB: 6 }), ['llama3', 'bob/llama3-uncensored', 'eve/llama-copy']);
  assert.deepEqual(run({ updatedDays: 30 }), ['llama3', 'bob/big']);
  const dd = applyFilters(all, { ...DEFAULT_FILTERS, dedupe: true }, 16, NOW);
  assert.deepEqual(dd.models.map(x => x.name), ['llama3', 'bob/llama3-uncensored', 'bob/big']);
  assert.equal(dd.hiddenDuplicates, 1);
  assert.deepEqual(run({ fitOnly: true }), ['llama3', 'bob/llama3-uncensored', 'eve/llama-copy']); // 70b does not fit in 16 GB
  assert.deepEqual(run({ view: 'new' }), ['llama3', 'bob/big']); // newest update first
  assert.ok(isNewModel(all[3], NOW) && !isNewModel(all[1], NOW));
  assert.deepEqual(run({ sort: 'name', dir: 'asc' }), ['bob/big', 'bob/llama3-uncensored', 'eve/llama-copy', 'llama3']);
  assert.deepEqual(run({ view: 'trending' })[0], 'llama3');
});

test('trending uses real download growth when the catalogue has it', () => {
  const all = [m({ name: 'old', pullsCount: 1000, growth: 5 }), m({ name: 'rising', pullsCount: 10, growth: 500 })];
  assert.equal(applyFilters(all, { ...DEFAULT_FILTERS, view: 'trending' }, 8, NOW).models[0].name, 'rising');
});

test('several quick picks and capabilities must ALL match', () => {
  const all = [
    m({ name: 'a', description: 'a coding model', sizes: ['1b'], capabilities: ['tools'] }),
    m({ name: 'b', description: 'a coding model', sizes: ['70b'], capabilities: ['tools'] }),
    m({ name: 'c', description: 'general chat', sizes: ['1b'], capabilities: ['tools', 'vision'] }),
  ];
  const run = (o) => applyFilters(all, { ...DEFAULT_FILTERS, ...o }, 16, NOW).models.map(x => x.name).sort();
  assert.deepEqual(run({ tasks: ['coding'] }), ['a', 'b']);
  assert.deepEqual(run({ tasks: ['small'] }), ['a', 'c']);
  assert.deepEqual(run({ tasks: ['coding', 'small'] }), ['a']);
  assert.deepEqual(run({ caps: ['tools', 'vision'] }), ['c']);
  assert.deepEqual(run({ tasks: ['coding'], caps: ['vision'] }), []);
});

test('quick picks', () => {
  const t = (id) => TASKS.find(x => x.id === id);
  assert.ok(t('coding').match(m({ name: 'qwen2.5-coder' })));
  assert.ok(!t('coding').match(m({ name: 'llama3', description: 'general model' })));
  assert.ok(t('small').match(m({ sizes: ['1b', '8b'] })));
  assert.ok(!t('small').match(m({ sizes: ['70b'] })));
  assert.ok(t('vision').match(m({ capabilities: ['vision'] })));
  assert.ok(t('embedding').match(m({ name: 'nomic-embed-text' })));
});

test('the address round-trips every setting', () => {
  const f = { ...DEFAULT_FILTERS, q: 'coder', scope: 'community', view: 'trending', caps: ['tools', 'vision'], tasks: ['coding', 'small'], sort: 'size', dir: 'asc', updatedDays: 30, maxGB: 8, minContextK: 32, owner: 'bob', dedupe: true, fitOnly: true };
  const url = filtersToQuery(f, ['a', 'b/c']);
  const back = queryToFilters(url);
  assert.deepEqual(back.filters, f);
  assert.deepEqual(back.compare, ['a', 'b/c']);
  assert.equal(filtersToQuery(DEFAULT_FILTERS), '');
  assert.deepEqual(queryToFilters('?scope=nonsense&sort=hack&max=abc').filters, DEFAULT_FILTERS);
});
