import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A formatted number whose changed digits roll for a moment, left to right, then settle. */
export function TickNumber({ value, className = '', style }: { value: string; className?: string; style?: React.CSSProperties }) {
  const [text, setText] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    if (reduced() || document.hidden) {
      setText(value);
      return;
    }
    const start = performance.now();
    const L = value.length, off = L - from.length;
    let raf = 0;
    const step = (now: number) => {
      const el = now - start;
      let s = '', done = true;
      for (let i = 0; i < L; i++) {
        const c = value[i]!, fc = from[i - off], settle = 140 + i * 32;
        if (/\d/.test(c) && fc !== c && el < settle) {
          done = false;
          s += String((Math.floor(el / 45) + +c + i) % 10);
        } else s += c;
      }
      setText(s);
      if (!done) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const fin = setTimeout(() => { cancelAnimationFrame(raf); setText(value); }, 140 + L * 32 + 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(fin); };
  }, [value]);

  return <span className={className} style={style}>{text}</span>;
}
