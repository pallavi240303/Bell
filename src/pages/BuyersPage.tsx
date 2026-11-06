import { ActorTools } from '@/components/ui/ActorTools';
import { Fragment } from 'react';
import { TickNumber } from '@/components/ui/TickNumber';
import { useBell } from '@/state/useBell';

/** Backup buyer view: post an offer, see escrow, reservations and claims. */
export function BuyersPage() {
  const v = useBell();
  return (
    <main className="max-w-380 my-0 mx-auto pt-9 px-[clamp(16px,_3vw,_40px)] pb-20 flex flex-col gap-7 [animation:pageIn_240ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="flex flex-col gap-2.5">
        <span className="text-[11px] tracking-[0.2em] text-muted">
          BUYERS
        </span>
        <h1 className="m-0 text-[clamp(22px,_3.2vw,_34px)] font-normal">
          Lock USDC. Earn a fee. Buy at the opening bell only if a loan needs you.
        </h1>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_420px),_1fr))] gap-6">
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-6 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="New offer">
          <span className="text-[11px] tracking-[0.2em] text-muted">
            NEW OFFER
          </span>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-[0.18em] text-muted">
              ASSET
            </span>
            <select className="[font-family:inherit] text-[22px] bg-transparent text-ink border-0 border-current border-b border-b-line py-2 px-0 rounded-none">
              <option>
                {v.stockSymbol}
              </option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 relative">
            <span className="text-[10px] tracking-[0.18em] text-muted">
              MAX SHARES
            </span>
            <input className="w-full [font-family:inherit] text-[26px] font-light text-ink bg-transparent border-0 border-current border-b border-b-line pt-2 pr-20 pb-2 pl-0 outline-none [caret-color:#EDECE8] [caret-shape:block] rounded-none focus:[border-bottom-color:#EDECE8] focus:[background-image:repeating-linear-gradient(0deg,_rgba(255,255,255,0.06)_0px,_rgba(255,255,255,0.06)_1px,_transparent_1px,_transparent_3px)]" inputMode="decimal" value={v.fShares} onChange={v.onFShares} />
            <span className="absolute right-0 bottom-3.5 text-[11px] tracking-[0.16em] text-muted pointer-events-none">
              SHARES
            </span>
          </label>
          <label className="flex flex-col gap-1.5 relative">
            <span className="text-[10px] tracking-[0.18em] text-muted">
              PRICE
            </span>
            <input className="w-full [font-family:inherit] text-[26px] font-light text-ink bg-transparent border-0 border-current border-b border-b-line pt-2 pr-30 pb-2 pl-0 outline-none [caret-color:#EDECE8] [caret-shape:block] rounded-none focus:[border-bottom-color:#EDECE8] focus:[background-image:repeating-linear-gradient(0deg,_rgba(255,255,255,0.06)_0px,_rgba(255,255,255,0.06)_1px,_transparent_1px,_transparent_3px)]" inputMode="decimal" value={v.fPct} onChange={v.onFPct} />
            <span className="absolute right-0 bottom-3.5 text-[11px] tracking-[0.16em] text-muted pointer-events-none">
              USDC / SHARE · {v.fPxFmt}
            </span>
          </label>
          <label className="flex flex-col gap-1.5 relative">
            <span className="text-[10px] tracking-[0.18em] text-muted">
              TOTAL PREMIUM
            </span>
            <input className="w-full [font-family:inherit] text-[26px] font-light text-ink bg-transparent border-0 border-current border-b border-b-line pt-2 pr-20 pb-2 pl-0 outline-none [caret-color:#EDECE8] [caret-shape:block] rounded-none focus:[border-bottom-color:#EDECE8] focus:[background-image:repeating-linear-gradient(0deg,_rgba(255,255,255,0.06)_0px,_rgba(255,255,255,0.06)_1px,_transparent_1px,_transparent_3px)]" inputMode="decimal" value={v.fFee} onChange={v.onFFee} />
            <span className="absolute right-0 bottom-3.5 text-[11px] tracking-[0.16em] text-muted pointer-events-none">
              USDC
            </span>
          </label>
          <div className="flex flex-col text-[13px] border-t border-t-line-soft">
            <div className="flex justify-between py-2.5 px-0 border-b border-b-line-soft">
              <span className="text-muted">
                USDC YOU LOCK
              </span>
              <TickNumber value={v.fEscrowFmt} className="inline-block max-w-full wrap-anywhere" />
            </div>
            <div className="flex justify-between py-2.5 px-0">
              <span className="text-muted">
                PREMIUM IF RESERVED
              </span>
              <TickNumber value={v.fFeesFmt} className="inline-block max-w-full wrap-anywhere" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {v.postOk && (
              <>
                <button className="[font-family:inherit] text-[13px] tracking-[0.18em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-4 px-5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onPost}>
                  LOCK USDC · POST OFFER
                </button>
              </>
            )}
            {v.postNo && (
              <>
                <button className="[font-family:inherit] text-[13px] tracking-[0.18em] text-muted bg-transparent border border-line rounded-[10px] py-4 px-5 cursor-not-allowed" disabled>
                  LOCK USDC · POST OFFER
                </button>
              </>
            )}
            <ActorTools role="buyer" />
          </div>
        </section>
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-4 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Claims">
          <span className="text-[11px] tracking-[0.2em] text-muted">
            CLAIMS · SHARES OWED TO YOU
          </span>
          {v.noClaims && (
            <>
              <span className="text-[13px] leading-[1.6] text-muted text-pretty">
                No claims yet. A claim appears when a covered loan settles at the opening bell and you buy its shares.
              </span>
            </>
          )}
          {v.claims.map((c: any, i: number) => (
            <Fragment key={i}>
              <div className="flex flex-col gap-3.5 py-4 px-0 border-t border-t-line-soft">
                <div className="flex justify-between gap-3 flex-wrap items-baseline">
                  <span className="text-[13px] tracking-[0.1em]">
                    {c.name}
                  </span>
                  <span className="text-[24px] font-light">
                    {c.shFmt}{' '}
                    <span className="text-[11px] text-muted">
                      {v.stockSymbol}
                    </span>
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-[12px] text-muted">
                  <span>
                    PAID {c.paidFmt} @ {c.pxFmt}
                  </span>
                  <span>
                    {c.unitsLabel} {c.worthFmt}
                  </span>
                </div>
                {c.canWithdraw && (
                  <>
                    <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-3 px-4.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms] hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={c.onWithdraw}>
                      WITHDRAW SHARES
                    </button>
                  </>
                )}
                {c.blocked && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-muted bg-transparent border border-line rounded-[10px] py-3 px-4.5 cursor-not-allowed" disabled>
                        {c.btnLabel}
                      </button>
                      <span className="text-[10px] tracking-[0.16em]" style={{ color: c.reasonColor }}>
                        {c.reason}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </Fragment>
          ))}
        </section>
      </div>
      <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-4 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Offers">
        <div className="flex justify-between gap-3 flex-wrap">
          <span className="text-[11px] tracking-[0.2em] text-muted">
            OFFERS · {v.stockSymbol}
          </span>
          <span className="text-[11px] tracking-[0.16em] text-muted">
            IMMUTABLE TERMS · RESERVED LOTS CANNOT CHANGE
          </span>
        </div>
        {v.noOffers && (
          <>
            <span className="text-[13px] text-muted">
              No posted offers in this contract snapshot.
            </span>
          </>
        )}
        {v.hasOffers && (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-190 flex flex-col">
                <div className="grid grid-cols-[1.4fr_0.8fr_0.9fr_0.8fr_1.1fr_1.1fr_1.1fr_1.6fr] gap-3 pt-0 px-0 pb-2.5 border-b border-b-line text-[10px] tracking-[0.16em] text-muted">
                  <span>
                    BUYER
                  </span>
                  <span>
                    SHARES
                  </span>
                  <span>
                    PRICE
                  </span>
                  <span>
                    FEE
                  </span>
                  <span>
                    LOCKED
                  </span>
                  <span>
                    RESERVED
                  </span>
                  <span>
                    EXPIRED
                  </span>
                  <span className="text-right">
                    STATUS
                  </span>
                </div>
                {v.offers.map((o: any, i: number) => (
                  <Fragment key={i}>
                    <div className="grid grid-cols-[1.4fr_0.8fr_0.9fr_0.8fr_1.1fr_1.1fr_1.1fr_1.6fr] gap-3 py-3 px-0 border-b border-b-line-soft text-[13px] [animation:fadeIn_300ms]">
                      <span className="tracking-[0.08em]">
                        {o.name}
                      </span>
                      <span>
                        {o.shFmt}
                      </span>
                      <span>
                        {o.pxFmt}
                      </span>
                      <span>
                        {o.feeFmt}
                      </span>
                      <span title={`Immutable capacity ${o.capacityFmt} · current locked cash ${o.escFmt}`}>
                        {o.escFmt}
                      </span>
                      <span>
                        {o.resFmt}
                      </span>
                      <span className="text-muted">
                        {o.expFmt}
                      </span>
                      <span className="text-right text-[10px] tracking-[0.14em]" style={{ color: o.color }}>
                        {o.status}{o.own && o.status === 'FREE' && <><button className="bg-transparent border border-line rounded-[10px] text-[inherit] cursor-pointer px-2 py-1" onClick={o.onCancel}>CANCEL</button><button className="bg-transparent border border-line rounded-[10px] text-[inherit] cursor-pointer px-2 py-1" onClick={o.onEdit}>CANCEL + REPOST</button></>}
                      </span>
                    </div>
                  </Fragment>
                ))}
              </div>
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
