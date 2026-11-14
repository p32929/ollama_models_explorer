import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Tip as TipContent } from '@/lib/explain';

/**
 * A tooltip that appears on hover or keyboard focus. It stays inside the screen, and never covers what it describes.
 * (Touch screens have no hover: there, the details panel carries the same explanations.)
 */
export function Tip({ tip, children, className = '', block = false }: { tip: TipContent | null | undefined; children: React.ReactNode; className?: string; block?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const show = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 250); }, []);
  const hide = useCallback(() => { clearTimeout(timer.current); setOpen(false); setPos(null); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', hide, true); };
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) return;
    const a = anchor.current.getBoundingClientRect();
    const b = bubble.current.getBoundingClientRect();
    const margin = 8;
    const above = a.top - b.height - 8 >= margin; // prefer above; flip below when there is no room
    const top = above ? a.top - b.height - 8 : a.bottom + 8;
    const left = Math.min(Math.max(margin, a.left + a.width / 2 - b.width / 2), window.innerWidth - b.width - margin);
    setPos({ left, top });
  }, [open]);

  if (!tip) return <>{children}</>;
  return (
    <span
      ref={anchor}
      className={`${block ? 'block' : 'inline-flex'} ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={bubble}
          id={id}
          role="tooltip"
          data-testid="tooltip"
          style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          className="pointer-events-none fixed z-[70] w-max max-w-[19rem] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left shadow-2xl"
        >
          <div className="text-[13px] font-semibold text-white">{tip.title}</div>
          {tip.lines.map((l, i) => <p key={i} className="mt-1 text-xs leading-relaxed text-zinc-300">{l}</p>)}
        </div>,
        document.body,
      )}
    </span>
  );
}
