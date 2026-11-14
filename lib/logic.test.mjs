// Plain Node tests for the pure logic. Run: node --experimental-strip-types --test lib/logic.test.mjs   (Node 22.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, parseParams, parseContext, daysSince } from './units.ts';
import { estimateDevice } from './device.ts';
import { fitOf, variantsOf, representatives } from './fit.ts';
import { activeFraction, tokensPerSecond, speedTier, describeSpeed, formatTps } from './speed.ts';
import { applyFilters, DEFAULT_FILTERS, isNewModel } from './filter.ts';
import { filtersToQuery, queryToFilters } from './urlState.ts';
import { TASKS } from './tasks.ts';
import { specsOf } from './specs.ts';
import { explainFit, explainSpeed, explainSize, explainContext, explainDownloads, explainCapability, COLUMN_HELP } from './explain.ts';

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
  const f = { ...DEFAULT_FILTERS, q: 'coder', scope: 'community', view: 'trending', caps: ['tools', 'vision'], tasks: ['coding', 'small'], sort: 'speed', dir: 'asc', updatedDays: 30, maxGB: 8, minContextK: 32, owner: 'bob', dedupe: true, fitOnly: true, minTps: 20 };
  const url = filtersToQuery(f, ['a', 'b/c']);
  const back = queryToFilters(url);
  assert.deepEqual(back.filters, f);
  assert.deepEqual(back.compare, ['a', 'b/c']);
  assert.equal(filtersToQuery(DEFAULT_FILTERS), '');
  assert.deepEqual(queryToFilters('?scope=nonsense&sort=hack&max=abc').filters, DEFAULT_FILTERS);
});

test('speed: memory bandwidth divided by the bytes read for each token', () => {
  const near = (a, b, pct = 3) => assert.ok(Math.abs(a - b) / b < pct / 100, `${a} is not within ${pct}% of ${b}`);
  near(tokensPerSecond(4.9, 1, 1008), 133.7); // an 8B model on an RTX 4090 (real programs get about 120 to 140)
  near(tokensPerSecond(4.9, 1, 200), 26.5); // the same model on an M-series Pro chip (about 25 to 30)
  near(tokensPerSecond(4.9, 1, 50), 6.6); // on an ordinary computer's memory (about 6 to 8)
  assert.equal(tokensPerSecond(0, 1, 500), 0);
  assert.equal(tokensPerSecond(5, 1, 0), 0);
  assert.ok(tokensPerSecond(0.01, 1, 1792) <= 400, 'capped');
  assert.equal(speedTier(60), 'fast');
  assert.equal(speedTier(20), 'good');
  assert.equal(speedTier(7), 'ok');
  assert.equal(speedTier(2), 'slow');
  assert.match(describeSpeed(40), /30 words per second/);
  assert.equal(formatTps(133.7), '130');
  assert.equal(formatTps(26.5), '27');
  assert.equal(formatTps(6.64), '6.6');
});

test('speed: mixture-of-experts models only read the experts they use', () => {
  assert.equal(activeFraction('qwen3', '30b-a3b-q4_K_M'), 0.1);
  assert.ok(Math.abs(activeFraction('mixtral', '8x7b') - 0.275) < 0.001);
  assert.ok(Math.abs(activeFraction('gpt-oss', '20b') - 3.6 / 20) < 0.001);
  assert.ok(Math.abs(activeFraction('deepseek-r1', '671b') - 37 / 671) < 0.001);
  assert.equal(activeFraction('llama3.1', '8b'), 1);
  assert.equal(activeFraction('llama3.1', 'latest'), 1);
  assert.equal(activeFraction('gpt-oss', '7b'), 1, 'a size that is not a known MoE size is dense');
  // "latest" names no size: the file size gives it away (gpt-oss:20b is a 14 GB download)
  assert.ok(Math.abs(activeFraction('gpt-oss', 'latest', 14) - 3.6 / 20) < 0.001);
  assert.equal(activeFraction('llama3.1', 'latest', 4.9), 1);
  // so a 19 GB MoE can write faster than a 5 GB dense model on the same computer
  assert.ok(tokensPerSecond(19, 0.1, 400) > tokensPerSecond(4.9, 1, 400));
});

test('devices come with a memory speed', () => {
  const win = (gpu) => estimateDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Windows', gpu });
  assert.equal(win('ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11, D3D11)').bandwidthGBs, 1008);
  assert.equal(win('ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11, D3D11)').bandwidthGBs, 960);
  const mac = (chip) => estimateDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'macOS', gpu: `ANGLE (Apple, ANGLE Metal Renderer: ${chip}, Unspecified Version)` }).bandwidthGBs;
  assert.equal(mac('Apple M1'), 68);
  assert.equal(mac('Apple M2 Pro'), 200);
  assert.equal(mac('Apple M3 Max'), 400);
  assert.equal(mac('Apple M4 Max'), 546);
  assert.equal(mac('Apple M1 Ultra'), 800);
  assert.equal(estimateDevice({ userAgent: 'x', platform: 'Linux', deviceMemory: 8 }).bandwidthGBs, 50);
  assert.ok(estimateDevice({ userAgent: 'x', platform: 'Linux' }).bandwidthGBs > 0, 'always an answer');
});

test('the fit also tells how fast, and the list can be filtered and sorted by it', () => {
  const v = (name, size) => ({ name, size, context: '', input: '', updated: '', url: '' });
  const dense = m({ name: 'dense', versions: [v('dense:8b', '4.9GB')], pullsCount: 1 });
  const moe = m({ name: 'moe', versions: [v('moe:30b-a3b-q4_K_M', '19GB')], pullsCount: 2 });
  const huge = m({ name: 'huge', versions: [v('huge:70b', '40GB')], pullsCount: 3 });
  const machine = { memoryGB: 24, bandwidthGBs: 400 };
  assert.ok(Math.abs(fitOf(dense, 24, 400).tps - 53) < 2);
  assert.ok(fitOf(moe, 24, 400).tps > 100);
  assert.equal(fitOf(huge, 24, 400).tps, 0); // does not fit: no speed
  assert.equal(fitOf(dense, 24).tps, 0); // speed unknown without a bandwidth
  const run = (o) => applyFilters([dense, moe, huge], { ...DEFAULT_FILTERS, ...o }, machine, NOW).models.map(x => x.name);
  assert.deepEqual(run({ sort: 'speed' }), ['moe', 'dense', 'huge']);
  assert.deepEqual(run({ minTps: 60 }), ['moe']);
  assert.deepEqual(run({ minTps: 20 }), ['moe', 'dense']);
  assert.deepEqual(run({ minTps: 0 }), ['huge', 'moe', 'dense']);
});

test('one recommended version per size: the usual 4-bit build, not the biggest 8-bit one', () => {
  const v = (name, size) => ({ name, size, context: '', input: '', updated: '', url: '' });
  const model = m({ name: 'coder', versions: [
    v('coder:7b-base-q2_K', '2.7GB'), v('coder:7b-instruct-q4_K_M', '4.7GB'), v('coder:7b-instruct-q8_0', '8.1GB'), v('coder:7b-instruct-fp16', '15GB'),
    v('coder:14b-instruct-q4_K_M', '9.0GB'), v('coder:14b-instruct-q8_0', '16GB'),
    v('coder:latest', '4.7GB'),
  ] });
  const reps = representatives(variantsOf(model));
  assert.deepEqual(reps.map(x => x.tag), ['7b-instruct-q4_K_M', '14b-instruct-q4_K_M']); // "latest" has the same size as the 7b, so it is not listed twice
  // on a 13 GB computer the 14b at 4 bits is the best that runs well, not the 7b at 8 bits
  const f = fitOf(model, 13, 400);
  assert.equal(f.status, 'good');
  assert.equal(f.best.tag, '14b-instruct-q4_K_M');
  assert.ok(Math.abs(f.tps - 28.9) < 1);
});

test('embedding models have no words-per-second', () => {
  const emb = m({ name: 'nomic-embed-text', capabilities: ['embedding'], sizes: ['137m'] });
  const f = fitOf(emb, 16, 400);
  assert.equal(f.status, 'good');
  assert.equal(f.tps, 0);
  assert.equal(fitOf(m({ name: 'tiny', sizes: ['137m'] }), 16, 400).tps > 0, true);
  assert.equal(formatTps(400), '400+');
});

test('tooltips say in plain words what the numbers mean', () => {
  const v = (name, size) => ({ name, size, context: '', input: '', updated: '', url: '' });
  const model = m({ name: 'llama', versions: [v('llama:8b', '4.9GB'), v('llama:70b', '40GB')], pullsCount: 121096547, updated: '2025-03-02', tagsCount: 2 });
  const machine = { label: 'Apple M2 Pro', memoryGB: 17, bandwidthGBs: 200 };
  const good = explainFit(fitOf(model, 17, 200), machine);
  assert.equal(good.title, 'Can run well');
  assert.match(good.lines[0], /8b version/);
  assert.match(good.lines[0], /about 17 GB of memory on Apple M2 Pro/);
  assert.match(good.lines[1], /Bigger versions/);
  assert.equal(explainFit(fitOf(model, 3, 200), machine).title, 'Too big to run');
  assert.match(explainFit(fitOf(model, 3, 200), machine).lines[0], /smallest version \(8b/);
  assert.equal(explainFit(fitOf(m({ capabilities: ['cloud'] }), 3, 200)).title, 'Cloud');
  assert.equal(explainFit(fitOf(m({}), 3, 200)).title, 'Size unknown');
  const fit = fitOf(model, 17, 200);
  const speed = explainSpeed(fit.tps, fit, machine);
  assert.match(speed.title, /^~27 tokens per second · Smooth$/);
  assert.ok(speed.lines.some(l => /200 GB\/s/.test(l) && /8b version/.test(l)));
  assert.ok(speed.lines.some(l => /varies by about a third/.test(l)));
  assert.match(explainSpeed(0, fitOf(model, 3, 200)).lines[0], /only shown for models that fit/);
  assert.match(explainSpeed(0, fit).lines[0], /do not write text/);
  assert.match(explainSize(model, '4.9GB – 40GB').lines[1], /2 versions/);
  assert.match(explainSize(m({ sizes: ['7b'] }), '7b').lines[0], /billions of parameters/);
  assert.match(explainDownloads(model).lines[0], /121,096,547 downloads/);
  assert.match(explainContext(32).lines[0], /24,000 words/);
  assert.equal(explainContext(0).lines[0], 'Not listed for this model.');
  assert.match(explainCapability('tools').lines[0], /call functions/);
  assert.match(explainCapability('weird').lines[0], /labels this model "weird"/);
  for (const key of ['model', 'fit', 'speed', 'size', 'capabilities', 'downloads', 'updated', 'context']) assert.ok(COLUMN_HELP[key].lines[0].length > 20, key);
});

test('specs: size range, download range and dense or mixture of experts', () => {
  const mk = (name, versions, sizes) => ({ name, description: '', capabilities: [], pulls: '', tags: '', updated: '', versions: versions.map(([n, s]) => ({ name: `${name}:${n}`, size: s, context: '', input: '', updated: '', url: '' })), sizes });
  const dense = specsOf(mk('llama3.1', [['8b-q4_K_M', '4.7GB'], ['70b-q4_K_M', '43GB'], ['405b-q4_K_M', '243GB']]));
  assert.deepEqual([dense.params, dense.download, dense.kind], ['8B – 405B', '4.7 GB – 243 GB', 'dense']);
  const moe = specsOf(mk('qwen3', [['8b-q4_K_M', '5.2GB'], ['30b-a3b-q4_K_M', '19GB']]));
  assert.equal(moe.kind, 'mixed');
  assert.equal(specsOf(mk('qwen3', [['30b-a3b-q4_K_M', '19GB']])).kind, 'moe');
  assert.equal(specsOf(mk('qwen3', [['30b-a3b-q4_K_M', '19GB']])).active, '~3B active');
  const community = specsOf(mk('bob/x', [], ['7b', '70b']));
  assert.equal(community.params, '7B – 70B');
  assert.ok(community.download.startsWith('~'), 'estimated sizes carry a ~');
  assert.equal(specsOf(mk('mystery', [], [])).kind, 'unknown');
});
