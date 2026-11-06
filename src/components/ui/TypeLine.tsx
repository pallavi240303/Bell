import { useEffect, useState } from 'react';

/** Text that types in letter by letter (32ms each) with a block cursor while typing. Re-types when the text changes. */
export function TypeLine({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text);
      return;
    }
    setShown(' ');
    let i = 0, iv = 0;
    const to = window.setTimeout(() => {
      iv = window.setInterval(() => {
        i++;
        setShown(text.slice(0, i) + (i < text.length ? '█' : ''));
        if (i >= text.length) clearInterval(iv);
      }, 32);
    }, delay);
    return () => { clearTimeout(to); clearInterval(iv); };
  }, [text, delay]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className={className}>{shown}</span>
    </>
  );
}
