import { ActorTools } from '@/components/ui/ActorTools';
import { TickNumber } from '@/components/ui/TickNumber';
import { useBell } from '@/state/useBell';

/** Lender view: supply and withdraw USDC, covered share of pool debt. */
export function LendPage() {
  const v = useBell();
  return (
    <main className="max-w-380 my-0 mx-auto pt-9 px-[clamp(16px,_3vw,_40px)] pb-20 flex flex-col gap-7 [animation:pageIn_240ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="flex flex-col gap-2.5">
        <span className="text-[11px] tracking-[0.2em] text-muted">
          LEND · USDC POOL
        </span>
        <h1 className="m-0 text-[clamp(22px,_3.2vw,_34px)] font-normal">
          Supply USDC. The pool holds ordinary and session-covered loans.
        </h1>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_260px),_1fr))] gap-6 border-t border-t-line border-b border-b-line py-5.5 px-0">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] tracking-[0.18em] text-muted">
            YOUR POOL SHARES
          </span>
          <span className="text-[clamp(26px,_3.6vw,_38px)] font-light">
            <TickNumber value={v.lend.balFmt} className="inline-block max-w-full wrap-anywhere" />
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] tracking-[0.18em] text-muted">
            TOTAL POOL ASSETS
          </span>
          <span className="text-[clamp(26px,_3.6vw,_38px)] font-light">
            <TickNumber value={v.lend.rateFmt} className="inline-block max-w-full wrap-anywhere" />
            {' '}
            <span className="text-[12px] text-muted">
              USDC
            </span>
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] tracking-[0.18em] text-muted">
            AVAILABLE LIQUIDITY
          </span>
          <span className="text-[clamp(26px,_3.6vw,_38px)] font-light">
            <TickNumber value={v.lend.utilFmt} className="inline-block max-w-full wrap-anywhere" />
          </span>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_380px),_1fr))] gap-6">
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-5.5 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Supply">
          <label className="flex flex-col gap-1.5 relative">
            <span className="text-[10px] tracking-[0.18em] text-muted">
              SUPPLY
            </span>
            <input className="w-full [font-family:inherit] text-[26px] font-light text-ink bg-transparent border-0 border-current border-b border-b-line pt-2 pr-17.5 pb-2 pl-0 outline-none [caret-color:#EDECE8] [caret-shape:block] rounded-none focus:[border-bottom-color:#EDECE8] focus:[background-image:repeating-linear-gradient(0deg,_rgba(255,255,255,0.06)_0px,_rgba(255,255,255,0.06)_1px,_transparent_1px,_transparent_3px)]" inputMode="decimal" placeholder="0.00" value={v.supIn} onChange={v.onSupIn} />
            <span className="absolute right-0 bottom-3.5 text-[11px] tracking-[0.16em] text-muted pointer-events-none">
              USDC
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
          {v.canSupply && (
            <>
              <button className="[font-family:inherit] text-[13px] tracking-[0.18em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-4 px-5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onSupply}>
                SUPPLY USDC
              </button>
            </>
          )}
          {v.cantSupply && (
            <>
              <div className="flex flex-col gap-1.5">
                <button className="[font-family:inherit] text-[13px] tracking-[0.18em] text-muted bg-transparent border border-line rounded-[10px] py-4 px-5 cursor-not-allowed" disabled>
                  SUPPLY USDC
                </button>
              </div>
            </>
          )}
          <ActorTools role="lender" />
          </div>
        </section>
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-5.5 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Redeem">
          <label className="flex flex-col gap-1.5 relative">
            <span className="text-[10px] tracking-[0.18em] text-muted">
              REDEEM SHARES
            </span>
            <input className="w-full [font-family:inherit] text-[26px] font-light text-ink bg-transparent border-0 border-current border-b border-b-line pt-2 pr-17.5 pb-2 pl-0 outline-none [caret-color:#EDECE8] [caret-shape:block] rounded-none focus:[border-bottom-color:#EDECE8] focus:[background-image:repeating-linear-gradient(0deg,_rgba(255,255,255,0.06)_0px,_rgba(255,255,255,0.06)_1px,_transparent_1px,_transparent_3px)]" inputMode="decimal" placeholder="0.00" aria-label="Pool shares to redeem" value={v.wdIn} onChange={v.onWdIn} />
            <span className="absolute right-0 bottom-3.5 text-[11px] tracking-[0.16em] text-muted pointer-events-none">
              SHARES
            </span>
          </label>
          {v.canWd && (
            <>
              <button className="[font-family:inherit] text-[13px] tracking-[0.18em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-4 px-5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onWd}>
                REDEEM SHARES
              </button>
            </>
          )}
          {v.cantWd && (
            <>
              <div className="flex flex-col gap-1.5">
                <button className="[font-family:inherit] text-[13px] tracking-[0.18em] text-muted bg-transparent border border-line rounded-[10px] py-4 px-5 cursor-not-allowed" disabled>
                  REDEEM SHARES
                </button>
                <span className="text-[10px] tracking-[0.16em] text-muted">
                  {v.wdReason}
                </span>
              </div>
            </>
          )}
        </section>
      </div>
      <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-4 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Pool debt">
        <div className="flex justify-between gap-3 flex-wrap text-[11px] tracking-[0.2em]">
          <span className="text-muted">
            POOL DEBT ·{' '}
            <span className="text-safe">
              COVERED{' '}
              <TickNumber value={v.lend.covPct} className="inline-block max-w-full wrap-anywhere" />
            </span>
            {' '}/{' '}
            <span className="text-ink">
              STANDARD{' '}
              <TickNumber value={v.lend.stdPct} className="inline-block max-w-full wrap-anywhere" />
            </span>
          </span>
          <span className="text-muted">
            <TickNumber value={v.lend.debtFmt} className="inline-block max-w-full wrap-anywhere" />
            {' '}LENT OUT
          </span>
        </div>
        <div className="flex h-3.5 border border-line">
          <div className="bg-safe-deep [transition:width_600ms_cubic-bezier(0.22,1,0.36,1)]" style={{ width: v.lend.covW }}></div>
          <div className="flex-1 bg-muted"></div>
        </div>
        <span className="text-[12px] leading-[1.6] text-muted text-pretty">
          Lenders bear ordinary credit risk. Active cover backs only its selected loan and session. Redemption burns pool shares and needs available cash.
        </span>
        {v.lend.hasRecv && (
          <>
            <div className="flex justify-between gap-3 flex-wrap border-t border-t-line-soft pt-4 text-[13px] [animation:fadeIn_400ms]">
              <span className="tracking-[0.12em]">
                REPAID FROM LOCKED CASH · MON 9:30 AM
              </span>
              <span className="text-safe">
                +{v.lend.recvFmt} USDC
              </span>
            </div>
          </>
        )}
      </section>
      {v.actionStatus && (
        <div className="text-[11px] tracking-[0.16em] wrap-anywhere" style={{ color: v.actionStatusColor }}>
          {v.actionStatus}{v.actionHash ? ' · ' : ''}{v.actionHash && v.actionExplorerUrl ? <a href={v.actionExplorerUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{v.actionHash}</a> : v.actionHash}
        </div>
      )}
    </main>
  );
}
