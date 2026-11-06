import { ActorTools } from '@/components/ui/ActorTools';
import { Fragment } from 'react';
import { Icon } from '@/components/ui/Icon';
import { TickNumber } from '@/components/ui/TickNumber';
import { useBell } from '@/state/useBell';

/** Borrower view: the loan, the cover quote and buying cover inside the window. */
export function BorrowPage() {
  const v = useBell();
  return (
    <main className="max-w-380 my-0 mx-auto pt-9 px-[clamp(16px,_3vw,_40px)] pb-20 flex flex-col gap-7 [animation:pageIn_240ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="flex flex-col gap-2.5">
        <span className="text-[11px] tracking-[0.2em] text-muted">
          BORROW · CONNECTED WALLET
        </span>
        <h1 className="m-0 text-[clamp(22px,_3.2vw,_34px)] font-normal">
          Backed before the bell.
        </h1>
        <p className="m-0 text-[14px] leading-[1.6] text-muted max-w-170 text-pretty">
          Choose exact whole buyer lots and review your consent. One wallet transaction reserves cover and funds the loan atomically.
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_420px),_1fr))] gap-6">
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-5.5 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Your position">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[11px] tracking-[0.2em] text-muted">
              YOUR POSITION
            </span>
            <span className="text-[11px] tracking-[0.18em] py-1.5 px-2.5 rounded-[10px]" style={{ border: `1px solid ${v.bell.badgeColor}`, color: v.bell.badgeColor }}>
              {v.bell.badge}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                COLLATERAL
              </span>
              <span className="text-[clamp(24px,_3.4vw,_34px)] font-light">
                <TickNumber value={v.bell.shFmt} className="inline-block max-w-full wrap-anywhere" />
                {' '}
                <span className="text-[12px] text-muted">
                  {v.stockSymbol}
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                DEBT
              </span>
              <span className="text-[clamp(24px,_3.4vw,_34px)] font-light">
                <TickNumber value={v.bell.debtFmt} className="inline-block max-w-full wrap-anywhere" />
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                {v.stockSymbol} PRICE
              </span>
              <span className="text-[18px]">
                <TickNumber value={v.bell.pxFmt} className="inline-block max-w-full wrap-anywhere" />
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                BORROW LIMIT
              </span>
              <span className="text-[18px]">
                <TickNumber value={v.bell.limitFmt} className="inline-block max-w-full wrap-anywhere" />
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="relative h-3 border border-line">
              <div className="absolute left-0 top-0 bottom-0 [transition:width_600ms_cubic-bezier(0.22,1,0.36,1),_background-color_300ms]" style={{ width: v.bell.barW, background: v.bell.barColor }}></div>
              <div className="absolute left-[70%] -top-1.5 -bottom-1.5 w-0.25 bg-ink"></div>
            </div>
            <div className="flex justify-between gap-3 text-[10px] tracking-[0.16em] text-muted">
              <span>
                DEBT{' '}
                <span style={{ color: v.bell.ratioColor }}>
                  {v.bell.ratioFmt}
                </span>
                {' '}OF VALUE
              </span>
              <span>
                CONTRACT LIMIT
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-4 border-t border-t-line-soft pt-5">
            <span className="text-[11px] tracking-[0.2em] text-muted">
              WHAT BACKS YOUR LOAN WHILE THE MARKET IS CLOSED
            </span>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[12px] tracking-[0.12em]">
                <span>
                  PRICE SAYS
                </span>
                <TickNumber value={v.bell.valFmt} className="inline-block max-w-full wrap-anywhere" />
              </div>
              <div className="h-2 border border-line">
                <div className="h-full w-full bg-muted"></div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[12px] tracking-[0.12em]">
                <span>
                  BOOK CASH LOCKED
                </span>
                <span>
                  <span className="text-muted">
                    —{' '}
                    <Icon name="arrow-right" size={12} />
                  </span>
                  {' '}
                  <span style={{ color: v.bell.lockColor }}>
                    <TickNumber value={v.bell.lockFmt} className="inline-block max-w-full wrap-anywhere" />
                  </span>
                </span>
              </div>
              <div className="h-2 border border-line">
                <div className="h-full bg-safe-deep [transition:width_600ms_cubic-bezier(0.22,1,0.36,1)]" style={{ width: v.bell.lockW }}></div>
              </div>
            </div>
            <span className="text-[12px] text-muted leading-[1.6]">
              A price can gap while the market is closed. Locked cash can't.
            </span>
          </div>
        </section>
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-5.5 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Cover">
          <div className="flex justify-between gap-3 flex-wrap">
            <span className="text-[11px] tracking-[0.2em] text-muted">
              COVER BREAKDOWN
            </span>
            <span className="text-[11px] tracking-[0.16em] text-muted">
              CONSENT REF {v.refCloseFmt}
            </span>
          </div>
          <div className="flex flex-col text-[14px]">
            <div className="flex justify-between py-2.5 px-0 border-b border-b-line-soft">
              <span className="text-muted">
                DEBT
              </span>
              <span>
                {v.quoteDebtFmt}
              </span>
            </div>
            <div className="flex justify-between py-2.5 px-0 border-b border-b-line-soft">
              <span className="text-muted">
                DEBT CEILING
              </span>
              <span>
                {v.quoteInterestFmt}
              </span>
            </div>
            <div className="flex justify-between py-2.5 px-0">
              <span className="text-muted">
                SETTLEMENT DEADLINE
              </span>
              <span>
                {v.quoteReserveFmt}
              </span>
            </div>
            <div className="flex justify-between pt-3.5 px-0 pb-2.5 [border-top:3px_double_#34343D] text-[18px]">
              <span>
                BOOK BOOK CASH LOCKED
              </span>
              <span>
                {v.needFmt}
              </span>
            </div>
            <div className="flex justify-between py-1 px-0 text-[12px] text-muted">
              <span>
                PREMIUM CREDIT
              </span>
              <span>
                {v.feesFmt}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {v.buyOk && (
              <>
                <button className="[font-family:inherit] text-[13px] tracking-[0.18em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-4 px-5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onBuy}>
                  SIGN ATOMIC BORROW
                </button>
              </>
            )}
            {v.buyNo && (
              <>
                <button className="[font-family:inherit] text-[13px] tracking-[0.18em] text-muted bg-transparent border border-line rounded-[10px] py-4 px-5 cursor-not-allowed" disabled>
                  SIGN ATOMIC BORROW
                </button>
              </>
            )}
            <ActorTools role="borrower" />
          </div>
        </section>
      </div>
      <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-4 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Cover quote">
        <span className="text-[11px] tracking-[0.2em] text-muted">
          EXACT WHOLE LOTS · SELECT IN CONTRACT ORDER
        </span>
        <div className="overflow-x-auto">
          <div className="min-w-170 flex flex-col">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.1fr_1.3fr] gap-3 pt-0 px-0 pb-2.5 border-b border-b-line text-[10px] tracking-[0.16em] text-muted">
              <span>
                BUYER
              </span>
              <span>
                PRICE
              </span>
              <span>
                TOTAL PREMIUM
              </span>
              <span>
                TERMS HASH
              </span>
              <span>
                SHARES
              </span>
              <span>
                CASH
              </span>
              <span className="text-right">
                STATUS
              </span>
            </div>
            {v.quote.map((q: any, i: number) => (
              <Fragment key={i}>
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.1fr_1.3fr] gap-3 py-3 px-0 border-b border-b-line-soft text-[13px]" style={{ color: q.fg }}>
                  <span className="tracking-[0.08em]">
                    {q.name}
                  </span>
                  <span>
                    {q.pxFmt}
                  </span>
                  <span>
                    {q.feeFmt}
                  </span>
                  <span>
                    <span data-provenance="hash">{q.id.slice(0, 10)}…</span>
                  </span>
                  <span>
                    {q.shFmt}
                  </span>
                  <span>
                    {q.cashFmt}
                  </span>
                  <span className="text-right text-[10px] tracking-[0.14em]" style={{ color: q.color }}>
                    <button className="bg-transparent border-0 p-0 [font-family:inherit] text-[inherit] cursor-pointer hover:underline" onClick={q.select} disabled={q.status !== 'FREE'} aria-pressed={q.selected}>{q.selected ? 'SELECTED' : q.status}</button>
                  </span>
                </div>
              </Fragment>
            ))}
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.1fr_1.3fr] gap-3 py-3 px-0 [border-top:3px_double_#34343D] text-[13px]">
              <span className="tracking-[0.08em]">
                TOTAL
              </span>
              <span></span>
              <span>
                {v.feesFmt}
              </span>
              <span></span>
              <span>
                {v.qShares}
              </span>
              <span>
                {v.needFmt}
              </span>
              <span></span>
            </div>
          </div>
        </div>
      </section>
      {v.actionStatus && (
        <div className="text-[11px] tracking-[0.16em] wrap-anywhere" style={{ color: v.actionStatusColor }}>
          {v.actionStatus}{v.actionHash ? ' · ' : ''}{v.actionHash && v.actionExplorerUrl ? <a href={v.actionExplorerUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{v.actionHash}</a> : v.actionHash}
        </div>
      )}
    </main>
  );
}
