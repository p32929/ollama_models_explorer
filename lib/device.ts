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
  /** How fast that memory can be read, in GB/s. This is what limits how many words per second a model can write. */
  bandwidthGBs: number;
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
const GPU_SPECS: [RegExp, number, number][] = [
  [/rtx\s*pro\s*6000/i, 96, 1792], [/h200/i, 141, 4800], [/h100/i, 80, 3350], [/a100/i, 40, 1555], [/l40s?/i, 48, 864], [/rtx\s*a6000/i, 48, 768], [/rtx\s*6000\s*ada/i, 48, 960],
  [/rtx\s*5090/i, 32, 1792], [/rtx\s*5080/i, 16, 960], [/rtx\s*5070\s*ti/i, 16, 896], [/rtx\s*5070/i, 12, 672], [/rtx\s*5060\s*ti/i, 16, 448], [/rtx\s*5060/i, 8, 448],
  [/rtx\s*4090/i, 24, 1008], [/rtx\s*4080/i, 16, 717], [/rtx\s*4070\s*ti\s*super/i, 16, 672], [/rtx\s*4070\s*ti/i, 12, 504], [/rtx\s*4070\s*super/i, 12, 504], [/rtx\s*4070/i, 12, 504],
  [/rtx\s*4060\s*ti/i, 8, 288], [/rtx\s*4060/i, 8, 272], [/rtx\s*4050/i, 6, 192],
  [/rtx\s*3090/i, 24, 936], [/rtx\s*3080\s*ti/i, 12, 912], [/rtx\s*3080/i, 10, 760], [/rtx\s*3070/i, 8, 448], [/rtx\s*3060\s*ti/i, 8, 448], [/rtx\s*3060/i, 12, 360], [/rtx\s*3050/i, 8, 224],
  [/rtx\s*2080\s*ti/i, 11, 616], [/rtx\s*2080/i, 8, 448], [/rtx\s*2070/i, 8, 448], [/rtx\s*2060/i, 6, 336],
  [/gtx\s*1660/i, 6, 192], [/gtx\s*1650/i, 4, 128], [/gtx\s*1080\s*ti/i, 11, 484], [/gtx\s*1080/i, 8, 320], [/gtx\s*1070/i, 8, 256], [/gtx\s*1060/i, 6, 192], [/gtx\s*1050/i, 4, 112],
  [/rx\s*9070\s*xt/i, 16, 640], [/rx\s*7900\s*xtx/i, 24, 960], [/rx\s*7900\s*xt/i, 20, 800], [/rx\s*7900\s*gre/i, 16, 576], [/rx\s*7800/i, 16, 624], [/rx\s*7700/i, 12, 432], [/rx\s*7600/i, 8, 288],
  [/rx\s*6950/i, 16, 576], [/rx\s*6900/i, 16, 512], [/rx\s*6800/i, 16, 512], [/rx\s*6750/i, 12, 432], [/rx\s*6700/i, 12, 384], [/rx\s*6600/i, 8, 224], [/rx\s*580/i, 8, 256],
  [/arc\s*b580/i, 12, 456], [/arc\s*b570/i, 10, 380], [/arc\s*a770/i, 16, 560], [/arc\s*a750/i, 8, 512], [/arc\s*a380/i, 6, 186],
];

// Apple Silicon: memory is shared and sold in several sizes. We cannot read it, so use a typical purchase.
const APPLE_TIERS: [RegExp, number][] = [
  [/ultra/i, 96], [/max/i, 48], [/pro/i, 24], [/^/, 16], // the last entry matches anything (a plain chip, or no chip name at all)
];
// Memory bandwidth (GB/s) by chip generation: [base, Pro, Max, Ultra]
const APPLE_BANDWIDTH: Record<string, [number, number, number, number]> = {
  '1': [68, 200, 400, 800], '2': [100, 200, 400, 800], '3': [100, 150, 400, 819], '4': [120, 273, 546, 819], '5': [153, 307, 614, 819],
};
const appleBandwidth = (gen: string | undefined, tier: string | undefined) => {
  const t = /ultra/i.test(tier || '') ? 3 : /max/i.test(tier || '') ? 2 : /pro/i.test(tier || '') ? 1 : 0;
  return (APPLE_BANDWIDTH[gen || ''] || [100, 200, 400, 800])[t];
};
// Ordinary computers read their memory at about this speed when no graphics card does the work
const CPU_BANDWIDTH = 50;

export function estimateDevice(env: DeviceEnv): Device {
  const ua = env.userAgent || '';
  const gpu = env.gpu || '';
  const isPhone = /iphone|ipod|android.*mobile/i.test(ua);
  const isTablet = /ipad|android(?!.*mobile)/i.test(ua);

  // Phones and tablets cannot run Ollama: they are almost certainly choosing a model for a computer.
  if (isPhone || isTablet) {
    return { label: 'a typical laptop (you are on a phone)', memoryGB: 16, bandwidthGBs: 100, kind: 'unified', confidence: 'guess' };
  }

  const spec = GPU_SPECS.find(([re]) => re.test(gpu));
  if (spec) {
    const name = /(?:geforce|radeon|arc|rtx|gtx|rx)[^,)]*/i.exec(gpu)?.[0]?.replace(/\s*(direct3d|vs_|ps_|opengl).*/i, '').trim() || gpu;
    return { label: name, memoryGB: spec[1], bandwidthGBs: spec[2], kind: 'gpu', confidence: 'estimated' };
  }

  const apple = /apple\s*m(\d+)(?:\s*(pro|max|ultra))?/i.exec(gpu);
  const mac = /mac/i.test(env.platform) || /macintosh/i.test(ua);
  if (apple || (mac && /apple/i.test(gpu))) {
    const chip = apple ? `Apple M${apple[1]}${apple[2] ? ` ${apple[2][0].toUpperCase()}${apple[2].slice(1).toLowerCase()}` : ''}` : 'Apple Silicon Mac';
    const total = APPLE_TIERS.find(([re]) => re.test(apple?.[2] || ''))![1];
    return { label: chip, memoryGB: Math.round(total * 0.7), bandwidthGBs: appleBandwidth(apple?.[1], apple?.[2]), kind: 'unified', confidence: 'estimated' };
  }

  // Safari hides the graphics card name ("Apple GPU"): a Mac, memory unknown
  if (mac) return { label: 'a Mac', memoryGB: Math.round(16 * 0.7), bandwidthGBs: 100, kind: 'unified', confidence: 'guess' };

  // Nothing to go on but the memory hint (Chrome reports at most 8)
  const ram = env.deviceMemory && env.deviceMemory > 0 ? env.deviceMemory : 0;
  if (ram >= 8) return { label: 'this computer (CPU)', memoryGB: Math.round(16 * 0.6), bandwidthGBs: CPU_BANDWIDTH, kind: 'cpu', confidence: 'guess' };
  if (ram > 0) return { label: `this computer (${ram} GB)`, memoryGB: Math.max(1, Math.round(ram * 0.6)), bandwidthGBs: CPU_BANDWIDTH, kind: 'cpu', confidence: 'detected' };
  return { label: 'a typical computer', memoryGB: 10, bandwidthGBs: CPU_BANDWIDTH, kind: 'cpu', confidence: 'guess' };
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
    return { label: 'a typical computer', memoryGB: 10, bandwidthGBs: CPU_BANDWIDTH, kind: 'cpu', confidence: 'guess' }; // never leave the page without an answer
  }
}

/** Presets for the one-tap correction. */
export const DEVICE_PRESETS: { label: string; memoryGB: number; bandwidthGBs: number; kind: Device['kind'] }[] = [
  { label: '8 GB laptop', memoryGB: 5, bandwidthGBs: 40, kind: 'cpu' },
  { label: '16 GB laptop', memoryGB: 11, bandwidthGBs: 50, kind: 'cpu' },
  { label: '32 GB laptop', memoryGB: 22, bandwidthGBs: 60, kind: 'cpu' },
  { label: '64 GB computer', memoryGB: 45, bandwidthGBs: 80, kind: 'cpu' },
  { label: '8 GB graphics card', memoryGB: 8, bandwidthGBs: 300, kind: 'gpu' },
  { label: '12 GB graphics card', memoryGB: 12, bandwidthGBs: 450, kind: 'gpu' },
  { label: '16 GB graphics card', memoryGB: 16, bandwidthGBs: 600, kind: 'gpu' },
  { label: '24 GB graphics card', memoryGB: 24, bandwidthGBs: 900, kind: 'gpu' },
  { label: '48 GB graphics card', memoryGB: 48, bandwidthGBs: 800, kind: 'gpu' },
  { label: '96 GB or more', memoryGB: 96, bandwidthGBs: 500, kind: 'unified' },
];
