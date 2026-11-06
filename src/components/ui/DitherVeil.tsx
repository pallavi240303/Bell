import { useEffect, useRef } from 'react';

type Props = { rgb: [number, number, number] | number[]; alpha: number; pixelSize: number; className?: string; style?: React.CSSProperties };

// 4x4 ordered (Bayer) threshold matrix
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * Dither veil: slow sine waves, 1-bit ordered dithering, drawn pixelated in one brand colour
 * on a transparent background. The cursor brightens the field around it.
 * BELL's dither effect (modelled on React Bits Dither).
 */
export function DitherVeil({ rgb, alpha, pixelSize, className = '', style }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = host.current, c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!el || !c || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const A = Math.round(255 * alpha);
    let W = 0, H = 0, img: ImageData | null = null, mx = -1, my = -1, visible = true, raf = 0, last = 0;

    const size = () => {
      const b = el.getBoundingClientRect();
      W = Math.max(1, Math.ceil(b.width / pixelSize));
      H = Math.max(1, Math.ceil(b.height / pixelSize));
      c.width = W;
      c.height = H;
      img = ctx.createImageData(W, H);
    };

    const draw = (t: number) => {
      raf = 0;
      if (!visible || !img) return;
      if (t - last < 33) { raf = requestAnimationFrame(draw); return; } // ~30 fps is plenty
      last = t;
      const T = reduce ? 0 : t * 0.00035, d = img.data;
      for (let y = 0; y < H; y++) {
        const ny = y / H;
        for (let x = 0; x < W; x++) {
          const nx = x / W;
          let v = 0.5 + 0.25 * Math.sin(nx * 7 + T * 3 + Math.sin(ny * 5 - T * 2) * 1.6) + 0.18 * Math.sin((nx + ny) * 11 - T * 4) + 0.12 * Math.cos(ny * 13 + T * 2.5);
          if (mx >= 0) {
            const dx = nx - mx, dy = ((ny - my) * H) / W;
            v += 0.35 * Math.exp(-(dx * dx + dy * dy) * 60);
          }
          v *= 0.25 + 0.75 * ny;
          const i = (y * W + x) * 4, on = v > BAYER[(y & 3) * 4 + (x & 3)]!;
          d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = on ? A : 0;
        }
      }
      ctx.putImageData(img, 0, 0);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(draw); };

    size();
    const ro = new ResizeObserver(() => { size(); wake(); });
    ro.observe(el);
    const io = new IntersectionObserver((es) => { visible = es[0]!.isIntersecting; if (visible) wake(); });
    io.observe(el);
    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      if (e.clientY < b.top || e.clientY > b.bottom) { mx = -1; return; }
      mx = (e.clientX - b.left) / b.width;
      my = (e.clientY - b.top) / b.height;
    };
    window.addEventListener('pointermove', move, { passive: true });
    wake();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', move);
    };
  }, [rgb[0], rgb[1], rgb[2], alpha, pixelSize]);

  return (
    <div ref={host} aria-hidden="true" className={`pointer-events-none block overflow-hidden ${className}`} style={style}>
      <canvas ref={canvas} className="block h-full w-full [image-rendering:pixelated]" />
    </div>
  );
}
