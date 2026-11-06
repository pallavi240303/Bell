import { useEffect, useRef } from 'react';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const noHover = () => window.matchMedia('(hover: none)').matches;

/**
 * Page-wide pointer interactions, delegated by attribute:
 * - click sparks (after React Bits ClickSpark), coloured by the nearest [data-spark-color]
 * - [data-spot] cards get a spotlight that follows the cursor (after React Bits SpotlightCard)
 * - [data-magnet] elements lean toward the cursor (after React Bits Magnet)
 * - [data-tilt] cards tilt toward the cursor in 3D (after React Bits TiltedCard)
 */
export function PointerEffects() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current!, ctx = c.getContext('2d')!;
    const size = () => {
      const d = Math.min(2, devicePixelRatio || 1);
      c.width = innerWidth * d; c.height = innerHeight * d;
      c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px';
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    size();

    type Spark = { x: number; y: number; a: number; t: number; col: string };
    let sparks: Spark[] = [], raf = 0, lastSpot: HTMLElement | null = null, tilted: HTMLElement | null = null;

    const loop = (t: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      sparks = sparks.filter((s) => t - s.t < 420);
      for (const s of sparks) {
        const k = (t - s.t) / 420, e = k * (2 - k), d = e * 26, len = 12 * (1 - e);
        ctx.strokeStyle = s.col; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(s.x + d * Math.cos(s.a), s.y + d * Math.sin(s.a));
        ctx.lineTo(s.x + (d + len) * Math.cos(s.a), s.y + (d + len) * Math.sin(s.a));
        ctx.stroke();
      }
      raf = sparks.length ? requestAnimationFrame(loop) : 0;
    };

    const down = (e: PointerEvent) => {
      if (reduced()) return;
      const tgt = (e.target as Element | null)?.closest?.('[data-spark-color]');
      const col = tgt?.getAttribute('data-spark-color') || '#3D3BF3', now = performance.now();
      for (let i = 0; i < 8; i++) sparks.push({ x: e.clientX, y: e.clientY, a: (Math.PI * 2 * i) / 8, t: now, col });
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const move = (e: PointerEvent) => {
      if (noHover()) return;
      const target = e.target as Element | null;
      // spotlight
      const spot = target?.closest?.('[data-spot]') as HTMLElement | null;
      if (lastSpot && lastSpot !== spot) lastSpot.style.backgroundImage = '';
      if (spot) {
        const b = spot.getBoundingClientRect();
        const col = spot.getAttribute('data-spot') || 'rgba(61,59,243,0.14)';
        spot.style.backgroundImage = `radial-gradient(420px circle at ${e.clientX - b.left}px ${e.clientY - b.top}px, ${col}, transparent 60%)`;
      }
      lastSpot = spot;
      if (reduced()) return;
      // magnet
      document.querySelectorAll<HTMLElement & { _mag?: boolean }>('[data-magnet]').forEach((el) => {
        const b = el.getBoundingClientRect(), pad = 60, cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const inside = e.clientX > b.left - pad && e.clientX < b.right + pad && e.clientY > b.top - pad && e.clientY < b.bottom + pad;
        if (inside) { el.style.translate = `${(e.clientX - cx) / 5}px ${(e.clientY - cy) / 5}px`; el._mag = true; }
        else if (el._mag) { el.style.translate = '0px 0px'; el._mag = false; }
      });
      // tilt
      const tilt = target?.closest?.('[data-tilt]') as HTMLElement | null;
      if (tilted && tilted !== tilt) tilted.style.transform = '';
      tilted = tilt;
      if (tilt) {
        const b = tilt.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
        tilt.style.transition = 'transform 120ms ease-out, border-color 250ms';
        tilt.style.transform = `perspective(900px) rotateX(${(-y * 9).toFixed(2)}deg) rotateY(${(x * 11).toFixed(2)}deg) scale(1.02)`;
      }
    };

    const leave = () => {
      if (lastSpot) lastSpot.style.backgroundImage = '';
      lastSpot = null;
      if (tilted) tilted.style.transform = '';
      tilted = null;
      document.querySelectorAll<HTMLElement>('[data-magnet]').forEach((el) => { el.style.translate = '0px 0px'; });
    };

    window.addEventListener('resize', size);
    window.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[200] block h-0 w-0" data-visual-effects="pointer">
      <canvas ref={canvas} className="pointer-events-none fixed inset-0" />
    </div>
  );
}
