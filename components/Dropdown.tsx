import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface Option {
  value: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  count?: number;
}

interface Props {
  id: string;
  label: string;
  icon?: React.ReactNode;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Pick several (all must match) instead of one */
  multi?: boolean;
  /** Text under the title in the phone sheet */
  help?: string;
  align?: 'left' | 'right';
}

/**
 * A button that opens a list of choices: a small panel on a big screen, a bottom sheet on a phone.
 * Several things can be ticked at once when `multi` is set.
 */
export function Dropdown({ id, label, icon, options, selected, onChange, multi = false, help, align = 'left' }: Props) {
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

  const toggle = (value: string) => {
    if (multi) onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
    else { onChange(selected[0] === value ? [] : [value]); setOpen(false); }
  };

  const picked = options.filter(o => selected.includes(o.value));
  const summary = !multi && picked[0] ? picked[0].label : label;

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        data-testid={`open-${id}`}
        className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm whitespace-nowrap transition-colors lg:h-9 ${selected.length ? 'border-zinc-500 bg-zinc-800 text-white' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-white'}`}
      >
        {icon}
        <span>{summary}</span>
        {multi && selected.length > 0 && <span className="rounded-full bg-white px-1.5 text-xs font-semibold text-black" data-testid={`${id}-count`}>{selected.length}</span>}
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label={label}
            data-testid={`${id}-panel`}
            className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl lg:absolute lg:inset-x-auto lg:bottom-auto lg:top-full lg:mt-2 lg:max-h-[70vh] lg:w-80 lg:rounded-xl ${align === 'right' ? 'lg:right-0' : 'lg:left-0'}`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3 lg:hidden">
              <div>
                <div className="font-semibold text-white">{label}</div>
                {help && <div className="text-xs text-zinc-500">{help}</div>}
              </div>
              <button onClick={() => setOpen(false)} className="h-9 rounded-md bg-white px-4 text-sm font-semibold text-black">Done</button>
            </div>
            <div className="overflow-y-auto p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]" role="group">
              {multi && help && <p className="hidden px-2.5 pb-1 pt-1.5 text-xs text-zinc-500 lg:block">{help}</p>}
              {options.map(o => {
                const on = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    role={multi ? 'menuitemcheckbox' : 'menuitemradio'}
                    aria-checked={on}
                    data-testid={`${id}-${o.value}`}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-900 ${on ? 'bg-zinc-900' : ''}`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center border ${multi ? 'rounded' : 'rounded-full'} ${on ? 'border-white bg-white text-black' : 'border-zinc-600'}`}>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    {o.icon && <span className="shrink-0 text-zinc-400">{o.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-white">{o.label}</span>
                      {o.hint && <span className="block text-xs text-zinc-500">{o.hint}</span>}
                    </span>
                    {o.count !== undefined && <span className="text-xs tabular-nums text-zinc-500">{o.count.toLocaleString()}</span>}
                  </button>
                );
              })}
              {multi && selected.length > 0 && (
                <button onClick={() => onChange([])} className="mt-1 w-full rounded-lg px-2.5 py-2.5 text-left text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white">Clear selection</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
