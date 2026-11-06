import { StairWipe } from '@/components/layout/StairWipe';
import { useBell } from '@/state/useBell';

/** Frosted staircase wipe with the BELL loader, shown while switching pages. */
export function PageTransition() {
  const v = useBell();
  return (
    <div className="fixed inset-0 z-[300] pointer-events-none grid grid-rows-4" aria-hidden="true">
      <StairWipe state={v.wipeState} rows={4} duration={340} stagger={40} />
      <div className="absolute inset-0 z-[301] flex flex-col items-center justify-center gap-0" style={{ opacity: v.loadOp, transition: v.loadT }}>
        <span className="absolute top-7 left-0 right-0 text-center text-[12px] tracking-[0.18em] text-white">
          (LOADING)
        </span>
        <span className="flex items-center gap-2">
          <span className="font-display text-[clamp(40px,_6vw,_72px)] leading-none tracking-[0.1em] text-ink">
            BELL
          </span>
          <span className="inline-block w-[clamp(8px,_1vw,_12px)] h-[clamp(30px,_4.6vw,_54px)] bg-indigo [animation:blink_1.06s_steps(1)_infinite]"></span>
        </span>
      </div>
    </div>
  );
}
