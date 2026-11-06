import { Fragment } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useBell } from '@/state/useBell';

/** Read-only deployment and report evidence. */
export function ControlPage() {
  const v = useBell();
  return (
    <main className="max-w-380 my-0 mx-auto pt-9 px-[clamp(16px,_3vw,_40px)] pb-20 flex flex-col gap-7 [animation:pageIn_240ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="flex flex-col gap-2.5">
        <span className="text-[11px] tracking-[0.2em] text-muted">
          CONTROL · READ-ONLY EVIDENCE
        </span>
        <h1 className="m-0 text-[clamp(22px,_3.2vw,_34px)] font-normal">
          Inspect contract truth and supplied report evidence.
        </h1>
        <span className="text-[11px] tracking-[0.14em] text-faint">
          CONNECTED WALLET · NO REPORT OR TOKEN AUTHORITY
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_380px),_1fr))] gap-6">
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-5 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Session">
          <span className="text-[11px] tracking-[0.2em] text-muted">
            SESSION · EVENT {v.evNum}
          </span>
          <span className="text-[15px] tracking-[0.06em]">
            {v.evTitle}
          </span>
          <div className="flex flex-wrap gap-2.5">
            <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-3 px-4.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onPrev}>
              <Icon name="arrow-left" />
              {' '}BACK
            </button>
            <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-3 px-4.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onAdvance}>
              REFRESH{' '}
              <Icon name="arrow-right" />
            </button>
          </div>
          <div className="flex flex-col gap-2.5 border-t border-t-line-soft pt-4.5">
            <span className="text-[10px] tracking-[0.18em] text-muted">
              ACCEPTED STATE
            </span>
            <div className="flex flex-wrap gap-2">
              {v.statusOpts.map((s: any, i: number) => (
                <Fragment key={i}>
                  <button className="[font-family:inherit] text-[11px] tracking-[0.14em] py-2.25 px-3 border border-line rounded-[10px] cursor-pointer hover:border-ink" style={{ color: s.fg, background: s.bg }} onClick={s.go} aria-pressed={s.aria === 'true'}>
                    {s.label}
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
        </section>
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-5 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Stock price">
          <span className="text-[11px] tracking-[0.2em] text-muted">
            LATEST REFERENCE · {v.controlReferenceFmt}
          </span>
          <label className="flex flex-col gap-1.5 relative">
            <span className="text-[10px] tracking-[0.18em] text-muted">
              REFRESH PRICE
            </span>
            <input className="w-full [font-family:inherit] text-[26px] font-light text-ink bg-transparent border-0 border-current border-b border-b-line pt-2 pr-17.5 pb-2 pl-0 outline-none [caret-color:#EDECE8] [caret-shape:block] rounded-none focus:[border-bottom-color:#EDECE8] focus:[background-image:repeating-linear-gradient(0deg,_rgba(255,255,255,0.06)_0px,_rgba(255,255,255,0.06)_1px,_transparent_1px,_transparent_3px)]" inputMode="decimal" placeholder="0.00" value={v.controlReferenceFmt} readOnly />
            <span className="absolute right-0 bottom-3.5 text-[11px] tracking-[0.16em] text-muted pointer-events-none">
              USDC
            </span>
          </label>
          <div className="flex flex-wrap gap-2.5">
            <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-3 px-4.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onSetPrice}>
              REFRESH PRICE
            </button>
            <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-3 px-4.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onClearPrice}>
              REFRESH EVIDENCE
            </button>
          </div>
        </section>
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-5 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Token">
          <span className="text-[11px] tracking-[0.2em] text-muted">
            {v.stockSymbol} TOKEN
          </span>
          <span className="text-[22px]" style={{ color: v.tokenColor }}>
            {v.tokenState}
          </span>
          <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-3 px-4.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onTogglePause}>
            {v.pauseLabel}
          </button>
        </section>
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-5 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Reset">
          <span className="text-[11px] tracking-[0.2em] text-muted">
            SOURCE · {v.scLabel}
          </span>
          <span className="text-[13px] leading-[1.6] text-muted">
            Reads the canonical snapshot. Report forwarding, token controls and clock changes remain outside the browser.
          </span>
          <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-loss bg-transparent [background-image:linear-gradient(#DC2626,#DC2626)] [background-repeat:no-repeat] [background-size:0%_100%] border border-loss-deep rounded-[10px] py-3 px-4.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onReset}>
            REFRESH
          </button>
        </section>
      </div>
    </main>
  );
}
