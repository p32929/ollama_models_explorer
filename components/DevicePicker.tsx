import { useEffect, useRef, useState } from 'react';
import { Cpu, RefreshCw, Check } from 'lucide-react';
import { DEVICE_PRESETS, type Device } from '@/lib/device';

interface Props {
  device: Device | null;
  onChange: (device: Device | null) => void; // null = go back to auto-detect
  fitOnly: boolean;
  onFitOnly: (value: boolean) => void;
}

/**
 * "My computer": shows what we detected on its own and lets the visitor correct it with one tap.
 * Nothing has to be typed.
 */
export function DevicePicker({ device, onChange, fitOnly, onFitOnly }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  if (!device) return <div className="h-9" aria-hidden />;
  const how = device.manual ? 'you chose this' : device.confidence === 'detected' ? 'detected' : device.confidence === 'estimated' ? 'estimated from your hardware' : 'a guess';

  return (
    <div className="flex items-center gap-2" data-testid="device-bar">
      <div className="relative min-w-0 flex-1 sm:flex-none" ref={box}>
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          data-testid="device-chip"
          className="flex w-full items-center gap-2 h-10 sm:h-9 px-3 rounded-full border border-zinc-700 bg-zinc-900 text-xs sm:text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <Cpu className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="truncate">
            <span className="text-zinc-400 hidden sm:inline">Your computer: </span>
            <span data-testid="device-label">{device.label}</span>
            <span className="text-zinc-400"> · ~{device.memoryGB} GB</span><span className="text-zinc-400 hidden sm:inline"> usable</span>
          </span>
        </button>
        {open && (
          <div
            role="dialog"
            aria-label="Choose your computer"
            className="absolute left-0 lg:left-auto lg:right-0 mt-2 z-40 w-[min(calc(100vw-1.5rem),22rem)] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl p-3 text-left"
          >
            <p className="text-xs text-zinc-400 px-1 pb-2">
              We read your hardware from the browser ({how}). Browsers hide exact memory, so if this looks wrong, pick the closest:
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEVICE_PRESETS.map(p => {
                const selected = device.manual && device.memoryGB === p.memoryGB && device.label === p.label;
                return (
                  <button
                    key={p.label}
                    onClick={() => { onChange({ label: p.label, memoryGB: p.memoryGB, kind: p.kind, confidence: 'detected', manual: true }); setOpen(false); }}
                    className={`flex items-center justify-between gap-1 rounded-md border px-2 py-2 text-xs text-left transition-colors ${selected ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
                  >
                    <span>{p.label}</span>
                    {selected && <Check className="h-3 w-3 text-blue-400" />}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <RefreshCw className="h-3 w-3" /> Detect again automatically
            </button>
          </div>
        )}
      </div>
      <label className="inline-flex shrink-0 items-center gap-2 h-10 sm:h-9 px-3 rounded-full border border-zinc-700 text-xs sm:text-sm text-zinc-300 cursor-pointer select-none hover:bg-zinc-900 has-[:checked]:border-emerald-700 has-[:checked]:text-emerald-300">
        <input type="checkbox" checked={fitOnly} onChange={e => onFitOnly(e.target.checked)} className="accent-emerald-500" data-testid="fit-only" />
        <span className="sm:hidden">Fits only</span><span className="hidden sm:inline">Only show what runs on it</span>
      </label>
    </div>
  );
}
