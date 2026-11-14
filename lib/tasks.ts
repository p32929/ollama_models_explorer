import type { ModelData } from './types';
import { parseParams } from './units.ts';

export interface Task {
  id: string;
  label: string;
  hint: string;
  match: (m: ModelData) => boolean;
}

const text = (m: ModelData) => `${m.name} ${m.description}`.toLowerCase();
const has = (m: ModelData, re: RegExp) => re.test(text(m));
const cap = (m: ModelData, c: string) => m.capabilities.some(x => x.toLowerCase() === c);

/** Quick picks: "what do you want to do?" Each one is a plain rule over the name, description and capabilities. */
export const TASKS: Task[] = [
  { id: 'coding', label: 'Coding', hint: 'Write and fix code', match: m => has(m, /\bcod(e|er|ing|ers)\b|program|developer|software|devstral|copilot/) },
  { id: 'small', label: 'Small & fast', hint: 'Runs on almost anything', match: m => (m.sizes || []).some(s => { const b = parseParams(s); return b > 0 && b <= 4; }) || m.versions.some(v => /^\s*\d+(\.\d+)?\s*(mb)|^\s*[0-3](\.\d+)?\s*gb/i.test(v.size)) },
  { id: 'vision', label: 'Images', hint: 'Understands pictures', match: m => cap(m, 'vision') || cap(m, 'image') || has(m, /\bvision\b|multimodal|\bvl\b|image/) },
  { id: 'reasoning', label: 'Reasoning', hint: 'Thinks step by step', match: m => cap(m, 'thinking') || has(m, /reasoning|\br1\b|think/) },
  { id: 'embedding', label: 'Embeddings', hint: 'Search and retrieval', match: m => cap(m, 'embedding') || has(m, /embed/) },
  { id: 'translation', label: 'Translation', hint: 'Other languages', match: m => has(m, /translat|multilingual|\bmt\b/) },
  { id: 'chat', label: 'Chat & roleplay', hint: 'Characters and stories', match: m => has(m, /role.?play|\brp\b|character|storytell|companion|\bchat\b|conversation/) },
  { id: 'math', label: 'Math', hint: 'Numbers and logic', match: m => has(m, /\bmath|\bstem\b|theorem|\bproof/) },
  { id: 'tools', label: 'Tool use', hint: 'Calls functions and agents', match: m => cap(m, 'tools') || has(m, /agent|function.?call/) },
];

export const TASK_BY_ID: Record<string, Task> = Object.fromEntries(TASKS.map(t => [t.id, t]));
