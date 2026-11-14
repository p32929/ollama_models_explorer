// Works out roughly what the visitor's computer can run, without asking them anything.
//
// Browsers deliberately hide exact hardware, so this is an estimate: we read the graphics card name (WebGL),
// the memory hint (navigator.deviceMemory, which Chrome rounds down to at most 8 GB) and the platform, and map
// them to typical memory sizes. The visitor can always correct it with one tap (see components/DevicePicker).

export interface Device {
  /** Short description shown in the UI, e.g. "Apple M2 Pro" */
  label: string;
  /** Memory a model can use, in GB (video memory, or a share of the shared memory) */
  memoryGB: number;
  kind: 'gpu' | 'unified' | 'cpu';
  /** detected: read from the browser; estimated: a typical value for the detected hardware; guess: nothing to go on */
  confidence: 'detected' | 'estimated' | 'guess';
  /** The visitor chose this themselves */
  manual?: boolean;
}

export interface DeviceEnv {
  userAgent: string;
  platform: string;
  deviceMemory?: number;
  cores?: number;
  gpu?: string;
}

// Video memory (GB) of common graphics cards. Longer, more specific names first.
const GPU_VRAM: [RegExp, number][] = [
  [/rtx\s*pro\s*6000/i, 96], [/h200/i, 141], [/h100/i, 80], [/a100/i, 40], [/l40s?/i, 48], [/rtx\s*a6000/i, 48], [/rtx\s*6000\s*ada/i, 48],
  [/rtx\s*5090/i, 32], [/rtx\s*5080/i, 16], [/rtx\s*5070\s*ti/i, 16], [/rtx\s*5070/i, 12], [/rtx\s*5060\s*ti/i, 16], [/rtx\s*5060/i, 8],
  [/rtx\s*4090/i, 24], [/rtx\s*4080/i, 16], [/rtx\s*4070\s*ti\s*super/i, 16], [/rtx\s*4070\s*ti/i, 12], [/rtx\s*4070\s*super/i, 12], [/rtx\s*4070/i, 12],
  [/rtx\s*4060\s*ti/i, 8], [/rtx\s*4060/i, 8], [/rtx\s*4050/i, 6],
  [/rtx\s*3090/i, 24], [/rtx\s*3080\s*ti/i, 12], [/rtx\s*3080/i, 10], [/rtx\s*3070/i, 8], [/rtx\s*3060\s*ti/i, 8], [/rtx\s*3060/i, 12], [/rtx\s*3050/i, 8],
  [/rtx\s*2080\s*ti/i, 11], [/rtx\s*2080/i, 8], [/rtx\s*2070/i, 8], [/rtx\s*2060/i, 6],
  [/gtx\s*1660/i, 6], [/gtx\s*1650/i, 4], [/gtx\s*1080\s*ti/i, 11], [/gtx\s*1080/i, 8], [/gtx\s*1070/i, 8], [/gtx\s*1060/i, 6], [/gtx\s*1050/i, 4],
  [/rx\s*9070\s*xt/i, 16], [/rx\s*7900\s*xtx/i, 24], [/rx\s*7900\s*xt/i, 20], [/rx\s*7900\s*gre/i, 16], [/rx\s*7800/i, 16], [/rx\s*7700/i, 12], [/rx\s*7600/i, 8],
  [/rx\s*6950/i, 16], [/rx\s*6900/i, 16], [/rx\s*6800/i, 16], [/rx\s*6750/i, 12], [/rx\s*6700/i, 12], [/rx\s*6600/i, 8], [/rx\s*580/i, 8],
  [/arc\s*b580/i, 12], [/arc\s*b570/i, 10], [/arc\s*a770/i, 16], [/arc\s*a750/i, 8], [/arc\s*a380/i, 6],
];

// Apple Silicon: memory is shared and sold in several sizes. We cannot read it, so use a typical purchase.
const APPLE_TIERS: [RegExp, number][] = [
  [/ultra/i, 96], [/max/i, 48], [/pro/i, 24], [/^/, 16], // the last entry matches anything (a plain chip, or no chip name at all)
];

export function estimateDevice(env: DeviceEnv): Device {
  const ua = env.userAgent || '';
  const gpu = env.gpu || '';
  const isPhone = /iphone|ipod|android.*mobile/i.test(ua);
  const isTablet = /ipad|android(?!.*mobile)/i.test(ua);

  // Phones and tablets cannot run Ollama: they are almost certainly choosing a model for a computer.
  if (isPhone || isTablet) {
    return { label: 'a typical laptop (you are on a phone)', memoryGB: 16, kind: 'unified', confidence: 'guess' };
  }

  const vram = GPU_VRAM.find(([re]) => re.test(gpu));
  if (vram) {
    const name = /(?:geforce|radeon|arc|rtx|gtx|rx)[^,)]*/i.exec(gpu)?.[0]?.replace(/\s*(direct3d|vs_|ps_|opengl).*/i, '').trim() || gpu;
    return { label: name, memoryGB: vram[1], kind: 'gpu', confidence: 'estimated' };
  }

  const apple = /apple\s*m(\d+)(?:\s*(pro|max|ultra))?/i.exec(gpu);
  const mac = /mac/i.test(env.platform) || /macintosh/i.test(ua);
  if (apple || (mac && /apple/i.test(gpu))) {
    const chip = apple ? `Apple M${apple[1]}${apple[2] ? ` ${apple[2][0].toUpperCase()}${apple[2].slice(1).toLowerCase()}` : ''}` : 'Apple Silicon Mac';
    const total = APPLE_TIERS.find(([re]) => re.test(apple?.[2] || ''))![1];
    return { label: chip, memoryGB: Math.round(total * 0.7), kind: 'unified', confidence: 'estimated' };
  }

  // Safari hides the graphics card name ("Apple GPU"): a Mac, memory unknown
  if (mac) return { label: 'a Mac', memoryGB: Math.round(16 * 0.7), kind: 'unified', confidence: 'guess' };

  // Nothing to go on but the memory hint (Chrome reports at most 8)
  const ram = env.deviceMemory && env.deviceMemory > 0 ? env.deviceMemory : 0;
  if (ram >= 8) return { label: 'this computer (CPU)', memoryGB: Math.round(16 * 0.6), kind: 'cpu', confidence: 'guess' };
  if (ram > 0) return { label: `this computer (${ram} GB)`, memoryGB: Math.max(1, Math.round(ram * 0.6)), kind: 'cpu', confidence: 'detected' };
  return { label: 'a typical computer', memoryGB: 10, kind: 'cpu', confidence: 'guess' };
}

/** Reads what the browser will tell us, then estimates. Browser only. */
export async function detectDevice(): Promise<Device> {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  const env: DeviceEnv = {
    userAgent: nav.userAgent,
    platform: nav.userAgentData?.platform || nav.platform || '',
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
  };
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) env.gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  } catch { /* no graphics info */ }
  try {
    // WebGPU names the card even where WebGL hides it
    const gpu = (navigator as any).gpu;
    const info = gpu && (await gpu.requestAdapter())?.info;
    if (info && !/rtx|gtx|radeon|rx\s*\d|arc|apple\s*m\d/i.test(env.gpu || '')) {
      const text = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ');
      if (text) env.gpu = `${env.gpu || ''} ${text}`.trim();
    }
  } catch { /* no WebGPU */ }
  try {
    return estimateDevice(env);
  } catch {
    return { label: 'a typical computer', memoryGB: 10, kind: 'cpu', confidence: 'guess' }; // never leave the page without an answer
  }
}

/** Presets for the one-tap correction. */
export const DEVICE_PRESETS: { label: string; memoryGB: number; kind: Device['kind'] }[] = [
  { label: '8 GB laptop', memoryGB: 5, kind: 'cpu' },
  { label: '16 GB laptop', memoryGB: 11, kind: 'cpu' },
  { label: '32 GB laptop', memoryGB: 22, kind: 'cpu' },
  { label: '64 GB computer', memoryGB: 45, kind: 'cpu' },
  { label: '8 GB graphics card', memoryGB: 8, kind: 'gpu' },
  { label: '12 GB graphics card', memoryGB: 12, kind: 'gpu' },
  { label: '16 GB graphics card', memoryGB: 16, kind: 'gpu' },
  { label: '24 GB graphics card', memoryGB: 24, kind: 'gpu' },
  { label: '48 GB graphics card', memoryGB: 48, kind: 'gpu' },
  { label: '96 GB or more', memoryGB: 96, kind: 'unified' },
];
