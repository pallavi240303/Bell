import { useEffect, useRef } from 'react';
import { animate } from 'motion';

export type WipeState = 'off' | 'in' | 'out';

const ease = (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2); // easeInOutQuart

/**
 * Page transition: one frosted layer (no seams between rows) revealed by a staircase
 * clip-path, row by row. 'in' covers from the left, 'out' uncovers to the right.
 */
export function StairWipe({ state, rows = 4, duration = 340, stagger = 40 }: { state: WipeState; rows?: number; duration?: number; stagger?: number }) {
  const layer = useRef<HTMLDivElement>(null);
  const L = useRef<number[]>(new Array(rows).fill(0));
  const R = useRef<number[]>(new Array(rows).fill(0));

  const paint = () => {
    const n = rows, h = 100 / n, pts: string[] = [];
    for (let i = 0; i < n; i++) pts.push(`${R.current[i]}% ${i * h}%`, `${R.current[i]}% ${(i + 1) * h}%`);
    for (let i = n - 1; i >= 0; i--) pts.push(`${L.current[i]}% ${(i + 1) * h}%`, `${L.current[i]}% ${i * h}%`);
    if (layer.current) layer.current.style.clipPath = `polygon(${pts.join(',')})`;
  };

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (state === 'off' || reduce) {
      if (state === 'in') { L.current.fill(0); R.current.fill(100); }
      else if (state === 'out') { L.current.fill(100); R.current.fill(100); }
      else { L.current.fill(0); R.current.fill(0); }
      paint();
      return;
    }
    const edge = state === 'in' ? R : L;
    if (state === 'in') L.current.fill(0); else R.current.fill(100);
    const controls = edge.current.map((from, i) =>
      animate(from, 100, {
        duration: duration / 1000,
        delay: (i * stagger) / 1000,
        ease,
        onUpdate: (x) => { edge.current[i] = x; paint(); },
      }),
    );
    return () => controls.forEach((c) => c.stop());
  }, [state]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[300]">
      <div
        ref={layer}
        className="absolute inset-0 bg-[rgba(10,10,12,0.45)] backdrop-blur-[24px] backdrop-saturate-[1.2]"
        style={{ clipPath: 'polygon(0 0,0 0,0 0)' }}
      />
    </div>
  );
}
