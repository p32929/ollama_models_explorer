import type { ModelData } from './types';
import type { Fit } from './fit';
import { describeSpeed, formatTps, speedTier, TIER_LABEL, wordsPerSecond } from './speed.ts';
import { formatGB } from './units.ts';

// Plain-language explanations for the tooltips: numbers and icons mean little on their own.
// Pure functions so they can be tested.

export interface Tip { title: string; lines: string[] }

export interface Machine { label: string; memoryGB: number; bandwidthGBs: number }

export const CAPABILITY_HELP: Record<string, string> = {
  tools: 'Can call functions and use tools, so it works for agents and apps that act on your behalf.',
  vision: 'Understands pictures as well as text: you can show it an image and ask about it.',
  thinking: 'Works through a problem step by step before answering. Slower, but often better at hard questions.',
  embedding: 'Turns text into numbers for search and matching. It does not chat.',
  audio: 'Can work with speech or sound.',
  cloud: "Runs on Ollama's servers instead of your computer.",
  image: 'Works with images.',
  code: 'Tuned for writing and fixing code.',
  chat: 'Made for back-and-forth conversation.',
};

export const explainCapability = (c: string): Tip => ({
  title: c.charAt(0).toUpperCase() + c.slice(1).toLowerCase(),
  lines: [CAPABILITY_HELP[c.toLowerCase()] || `Ollama labels this model "${c}".`],
});

const need = (sizeGB: number) => sizeGB * 1.15 + 0.5; // keep in step with lib/fit.ts

export function explainFit(fit: Fit, m?: Machine): Tip {
  const mem = m ? `about ${m.memoryGB} GB of memory` : 'your memory';
  const where = m ? ` on ${m.label}` : '';
  switch (fit.status) {
    case 'good': {
      const b = fit.best!;
      return {
        title: 'Runs well',
        lines: [
          `The ${b.label} version${b.estimated ? ' (size estimated)' : ''} is about ${formatGB(b.sizeGB)} to download and needs roughly ${formatGB(need(b.sizeGB))} to run, which fits comfortably in ${mem}${where}.`,
          fit.variants.length > 1 ? 'Bigger versions of this model need more memory than you have.' : '',
        ].filter(Boolean),
      };
    }
    case 'tight': {
      const b = fit.best!;
      return { title: 'Tight fit', lines: [`The smallest version (${b.label}, about ${formatGB(b.sizeGB)}) fits in ${mem}${where}, but with little to spare. It works, but long chats may slow down.`] };
    }
    case 'no': {
      const s = fit.smallest!;
      return { title: 'Too big', lines: [`Even the smallest version (${s.label}, about ${formatGB(s.sizeGB)}) needs roughly ${formatGB(need(s.sizeGB))} to run. You have ${mem}${where}.`] };
    }
    case 'cloud':
      return { title: 'Cloud', lines: ["This model runs on Ollama's servers instead of your computer, so your memory does not matter."] };
    default:
      return { title: 'Size unknown', lines: ["No download size is listed for this model, so we can't tell whether it fits."] };
  }
}

export function explainSpeed(tps: number, fit: Fit, m?: Machine): Tip {
  if (!(tps > 0)) {
    return { title: 'No speed', lines: [fit.status === 'good' || fit.status === 'tight' ? 'Speed is not shown for models that do not write text (such as embedding models).' : 'Speed is only shown for models that fit on your computer.'] };
  }
  const tier = speedTier(tps);
  const b = fit.best;
  const lines = [
    `Roughly ${wordsPerSecond(tps)} words per second: ${describeSpeed(tps).replace(/^about \d+ words per second \(|\)$/g, '')}.`,
    b && m ? `Worked out from ${m.label}'s memory speed (about ${m.bandwidthGBs} GB/s) and the ${b.label} version (${formatGB(b.sizeGB)}).` : '',
    b && b.fraction < 1 ? `This model only uses part of itself for each word, so it is faster than its size suggests.` : '',
    'An estimate: real speed varies by about a third either way.',
  ].filter(Boolean);
  return { title: `~${formatTps(tps)} tokens per second · ${TIER_LABEL[tier]}`, lines };
}

export function explainSize(model: ModelData, sizeText: string): Tip {
  const n = model.versions.length || model.tagsCount || 0;
  const estimated = !model.versions.length;
  return {
    title: 'Download size',
    lines: [
      estimated
        ? `Parameter sizes this model comes in: ${sizeText}. The "b" means billions of parameters: more is usually smarter but bigger and slower.`
        : `Download sizes of its versions, smallest to biggest: ${sizeText}.`,
      n ? `${n} version${n === 1 ? '' : 's'} in total. Click the model to see them all.` : '',
    ].filter(Boolean),
  };
}

export const explainDownloads = (model: ModelData): Tip => ({
  title: 'Downloads',
  lines: [model.pullsCount ? `${model.pullsCount.toLocaleString()} downloads from ollama.com: a rough sign of how popular it is.` : 'Not listed.'],
});

export const explainUpdated = (model: ModelData): Tip => ({
  title: 'Last updated',
  lines: [model.updated ? `The author last changed this model on ${new Date(`${model.updated}T00:00:00Z`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}.` : 'Not listed.'],
});

export function explainContext(contextK: number): Tip {
  if (!contextK) return { title: 'Context window', lines: ['Not listed for this model.'] };
  const words = Math.round(contextK * 1000 * 0.75);
  return {
    title: `${contextK >= 1000 ? `${contextK / 1000}M` : `${contextK}K`} tokens of context`,
    lines: [`How much text it can read and remember at once: about ${words.toLocaleString()} words, roughly ${Math.max(1, Math.round(words / 500))} pages. Longer chats and bigger documents need more.`],
  };
}

export const COLUMN_HELP: Record<string, Tip> = {
  model: { title: 'Model', lines: ['Click a model to see its speed, every version and the install command. Tick the box to compare.'] },
  fit: { title: 'On your computer', lines: ["Whether the model fits in your computer's memory. Hover a badge to see why."] },
  speed: { title: 'Speed', lines: ['Estimated tokens per second on your computer. A token is about three quarters of a word.'] },
  size: { title: 'Size', lines: ['Download size from the smallest to the biggest version. Community models show parameter counts (billions) instead.'] },
  capabilities: { title: 'Capabilities', lines: ['What the model can do besides write text. Hover one to learn what it means.'] },
  downloads: { title: 'Downloads', lines: ['How many times it was downloaded from ollama.com.'] },
  updated: { title: 'Updated', lines: ['When the author last changed it.'] },
  context: { title: 'Context window', lines: ['How much text it can read and remember at once.'] },
};
