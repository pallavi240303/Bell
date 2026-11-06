import { useEffect, useRef } from 'react';

const SELECTOR = '[data-target],button,a,input,select,summary,[role="button"]';
const S = 11; // corner size
const G = 16; // idle offset of each corner from the pointer

/**
 * Target cursor (after React Bits TargetCursor): four rounded corner brackets around a dot.
 * They sit still around the pointer and snap to frame whatever button, link or field is hovered.
 */
export function TargetCursor() {
  const wrap = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const corners = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    document.documentElement.classList.add('cursor-none-all');
    const [tl, tr, bl, br] = corners.current as [HTMLSpanElement,HTMLSpanElement,HTMLSpanElement,HTMLSpanElement];
    let mx = -100, my = -100, tgt: Element | null = null, raf = 0, down = false;

    const idle = () => {
      tl.style.transform = `translate(${-G}px,${-G}px)`;
      tr.style.transform = `translate(${G - S}px,${-G}px)`;
      bl.style.transform = `translate(${-G}px,${G - S}px)`;
      br.style.transform = `translate(${G - S}px,${G - S}px)`;
    };
    const frame = () => {
      raf = 0;
      if (wrap.current) wrap.current.style.transform = `translate(${mx}px,${my}px)`;
      if (tgt && tgt.isConnected) {
        const b = tgt.getBoundingClientRect(), p = 6;
        tl.style.transform = `translate(${b.left - p - mx}px,${b.top - p - my}px)`;
        tr.style.transform = `translate(${b.right + p - S - mx}px,${b.top - p - my}px)`;
        bl.style.transform = `translate(${b.left - p - mx}px,${b.bottom + p - S - my}px)`;
        br.style.transform = `translate(${b.right + p - S - mx}px,${b.bottom + p - S - my}px)`;
      }
      if (dot.current) dot.current.style.transform = down ? 'scale(.6)' : '';
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const move = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      const t = (e.target as Element | null)?.closest?.(SELECTOR) ?? null;
      if (t !== tgt) { tgt = t; if (!tgt) idle(); }
      req();
    };
    const onDown = () => { down = true; req(); };
    const onUp = () => { down = false; req(); };
    const leave = () => { mx = my = -100; tgt = null; idle(); req(); };

    idle();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', req);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.documentElement.removeEventListener('pointerleave', leave);
      document.documentElement.classList.remove('cursor-none-all');
    };
  }, []);

  const corner = 'absolute left-0 top-0 box-content h-[11px] w-[11px] border-[2.5px] border-solid border-white [transition:transform_.18s_cubic-bezier(.22,1,.36,1)]';
  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[400] h-0 w-0 mix-blend-difference" data-visual-effects="cursor">
      <div ref={wrap} className="fixed left-0 top-0 h-0 w-0 will-change-transform">
        <span ref={dot} className="absolute -left-0.5 -top-0.5 h-1 w-1 rounded-full bg-white [transition:transform_.2s]" />
        <div className="absolute left-0 top-0 h-0 w-0">
          <span ref={(el) => { corners.current[0] = el; }} className={`${corner} border-r-0 border-b-0 rounded-tl-[5px]`} />
          <span ref={(el) => { corners.current[1] = el; }} className={`${corner} border-l-0 border-b-0 rounded-tr-[5px]`} />
          <span ref={(el) => { corners.current[2] = el; }} className={`${corner} border-r-0 border-t-0 rounded-bl-[5px]`} />
          <span ref={(el) => { corners.current[3] = el; }} className={`${corner} border-l-0 border-t-0 rounded-br-[5px]`} />
        </div>
      </div>
    </div>
  );
}
