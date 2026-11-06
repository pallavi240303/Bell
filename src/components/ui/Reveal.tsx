import { motion, useReducedMotion } from 'motion/react';

/** Fade + 12px rise the first time it scrolls into view (12% visible). `delay` is in ms. */
export function Reveal({ delay = 0, className = '', style, children }: { delay?: number; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className={`block ${className}`} style={style}>
      <motion.div
        className="h-full"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.12 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1], delay: delay / 1000 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
