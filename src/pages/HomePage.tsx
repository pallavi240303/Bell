import { Fragment } from 'react';
import { DitherVeil } from '@/components/ui/DitherVeil';
import { Icon } from '@/components/ui/Icon';
import { Reveal } from '@/components/ui/Reveal';
import { useBell } from '@/state/useBell';

/** Landing page: hero, problem, proof, who takes part, rules, FAQ and the closing band. */
export function HomePage() {
  const v = useBell();
  return (
    <main className="max-w-380 my-0 mx-auto py-0 px-[clamp(16px,_3vw,_40px)] flex flex-col [animation:pageIn_240ms_cubic-bezier(0.22,1,0.36,1)]">
      <section className="relative isolate min-h-[calc(100svh_-_92px)] flex flex-col justify-center gap-11 pt-8 px-0 pb-10" data-sec="0">
        <DitherVeil rgb={[61,59,243]} alpha={0.55} pixelSize={4} className="absolute -top-35 bottom-0 left-[calc(50%_-_50vw)] w-screen -z-1 blur-[2px] [mask-image:linear-gradient(to_bottom,_transparent_0%,_#000_35%,_#000_70%,_transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,_transparent_0%,_#000_35%,_#000_70%,_transparent_100%)]" />
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_440px),_1fr))] items-center gap-11">
          <div className="flex flex-col gap-6 min-w-0">
            <span className="text-[13px] tracking-[0.16em] text-violet [animation:riseIn_500ms_both]">
              FOR TOKENIZED-STOCK LOANS
            </span>
            <h1 className="m-0 text-[clamp(32px,_4.8vw,_64px)] font-light leading-[1.05] tracking-[-0.02em] text-balance [animation:riseIn_600ms_80ms_both]">
              YOUR EXIT IS BOOKED
              <br />
              <span className="text-violet">
                BEFORE THE CLOSE.
              </span>
            </h1>
            <p className="m-0 text-[clamp(14px,_1.3vw,_17px)] leading-[1.7] text-white max-w-135 text-pretty [animation:riseIn_600ms_160ms_both]">
              BELL locks a funded buyer for your covered loan before the stock market closes. No liquidation while the market is closed.
            </p>
            <div className="flex flex-wrap gap-3 [animation:riseIn_600ms_240ms_both]">
              <button className="[font-family:inherit] text-[12px] tracking-[0.16em] inline-flex items-center gap-2.5 py-3.5 px-5.5 cursor-pointer text-white bg-indigo border border-indigo [background-image:linear-gradient(#EDECE8,#EDECE8)] [background-repeat:no-repeat] [background-size:0%_100%] [transition:background-size_420ms_cubic-bezier(0.22,1,0.36,1),_color_420ms,_border-color_420ms] rounded-[10px] hover:[background-size:100%_100%] hover:text-bg hover:border-ink active:[transform:translateY(1px)]" onClick={v.goBorrow}>
                PROTECT A LOAN{' '}
                <Icon name="arrow-right" />
              </button>
              <button className="[font-family:inherit] text-[12px] tracking-[0.16em] inline-flex items-center gap-2.5 py-3.5 px-5.5 cursor-pointer text-bg bg-ink border border-ink [background-image:linear-gradient(#8B8AFF,#8B8AFF)] [background-repeat:no-repeat] [background-size:0%_100%] [transition:background-size_420ms_cubic-bezier(0.22,1,0.36,1),_border-color_420ms] rounded-[10px] hover:[background-size:100%_100%] hover:border-violet active:[transform:translateY(1px)]" onClick={v.goReplay}>
                <Icon name="play" size={13} />
                {' '}WATCH THE REPLAY
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] tracking-[0.12em] text-dim [animation:riseIn_600ms_320ms_both]">
              <span className="py-1.75 px-3 border border-line rounded-[999px] whitespace-nowrap">
                FRIDAY · BUYER BOOKED, USDC LOCKED
              </span>
              <span className="py-1.75 px-3 border border-line rounded-[999px] whitespace-nowrap">
                WEEKEND · NO LIQUIDATION
              </span>
              <span className="py-1.75 px-3 border border-line rounded-[999px] whitespace-nowrap">
                MONDAY · ONLY WHAT'S NEEDED IS SOLD
              </span>
            </div>
          </div>
          <figure className="m-0 min-w-0 [animation:riseIn_700ms_300ms_both]">
            <div className="relative border border-line-soft rounded-[18px] overflow-hidden">
              <img className="block w-full h-auto" src="/images/hero-weekend.jpg" alt="Chart: the stock price falls while the market is closed for the weekend and illustrates buyer cash reserved before market closure." width="1280" height="680" />
              <span className="absolute bottom-3.5 [transform:translateX(-50%)] text-[11px] tracking-[0.16em] text-[rgba(237,236,232,0.55)] pointer-events-none left-[16.7%]">
                FRI
              </span>
              <span className="absolute bottom-3.5 [transform:translateX(-50%)] text-[11px] tracking-[0.16em] pointer-events-none left-[50%] text-[rgba(139,138,255,0.75)]">
                WEEKEND
              </span>
              <span className="absolute bottom-3.5 [transform:translateX(-50%)] text-[11px] tracking-[0.16em] text-[rgba(237,236,232,0.55)] pointer-events-none left-[83.3%]">
                MON
              </span>
            </div>
          </figure>
        </div>
      </section>
      <div className="ml-[calc(50%_-_50vw)] mr-[calc(50%_-_50vw)] bg-indigo text-white overflow-hidden py-4 px-0" aria-hidden="true">
        <div className="flex w-max [animation:marquee_36s_linear_infinite]">
          <div className="flex items-center gap-10 pr-10 font-display text-[clamp(22px,_3vw,_38px)] leading-none tracking-[0.06em] whitespace-nowrap">
            <span>
              CLOSING BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              MARKET CLOSED
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              OPENING BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              BACKED BEFORE THE BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              CLOSING BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              MARKET CLOSED
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              OPENING BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              BACKED BEFORE THE BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
          </div>
          <div className="flex items-center gap-10 pr-10 font-display text-[clamp(22px,_3vw,_38px)] leading-none tracking-[0.06em] whitespace-nowrap">
            <span>
              CLOSING BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              MARKET CLOSED
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              OPENING BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              BACKED BEFORE THE BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              CLOSING BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              MARKET CLOSED
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              OPENING BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
            <span>
              BACKED BEFORE THE BELL
            </span>
            <span className="inline-block w-[0.26em] h-[0.26em] bg-white"></span>
          </div>
        </div>
      </div>
      <Reveal delay={0} >
        <section className="flex flex-col gap-12 py-26 px-0" data-sec="1">
          <div className="flex flex-col items-center text-center gap-4 max-w-205 my-0 mx-auto">
            <p className="m-0 text-[16px] leading-[1.7] text-muted max-w-155">
              Tokenized stocks trade around the clock. Their underlying markets don't.
            </p>
            <h2 className="m-0 text-[clamp(32px,_4vw,_54px)] font-light leading-[1.06] tracking-[-0.02em] text-balance">
              TWO PRICES.
              <br />
              <span className="text-violet">
                NEITHER GUARANTEES AN EXIT.
              </span>
            </h2>
          </div>
          <div className="relative flex flex-col gap-3.5 p-7 border border-line-soft bg-panel rounded-[22px] min-w-0 overflow-hidden" data-spot="rgba(61,59,243,0.12)">
            <svg className="block w-full h-auto" viewBox="0 0 640 146" role="img" aria-label="A token price path across the closed-market window, with one off-hours outlier print far below the rest.">
              <defs>
                <pattern id="pbA" x="0" y="20" width="10" height="10" patternUnits="userSpaceOnUse">
                  <circle cx="5.0" cy="5.0" r="1.3" fill="#26262E" />
                </pattern>
                <pattern id="pbB" x="0" y="20" width="10" height="10" patternUnits="userSpaceOnUse">
                  <circle cx="5.0" cy="5.0" r="1.3" fill="#3A39A0" />
                </pattern>
              </defs>
              <rect x="0" y="20" width="640" height="120" fill="url(#pbA)" />
              <rect x="160" y="20" width="320" height="120" fill="#0A0A0C" />
              <rect x="160" y="20" width="320" height="120" fill="url(#pbB)" />
              <text x="320" y="12" textAnchor="middle" fontSize="10" letterSpacing="1.6" fill="#8B8AFF">
                MARKET CLOSED
              </text>
              <text x="5" y="12" fontSize="10" letterSpacing="1.6" fill="#5C5B66">
                FRI
              </text>
              <text x="635" y="12" textAnchor="end" fontSize="10" letterSpacing="1.6" fill="#5C5B66">
                MON
              </text>
              <circle cx="5" cy="65" r="3" fill="#EDECE8" />
              <circle cx="15" cy="65" r="3" fill="#EDECE8" />
              <circle cx="25" cy="65" r="3" fill="#EDECE8" />
              <circle cx="35" cy="55" r="3" fill="#EDECE8" />
              <circle cx="45" cy="55" r="3" fill="#EDECE8" />
              <circle cx="55" cy="55" r="3" fill="#EDECE8" />
              <circle cx="65" cy="55" r="3" fill="#EDECE8" />
              <circle cx="75" cy="65" r="3" fill="#EDECE8" />
              <circle cx="85" cy="65" r="3" fill="#EDECE8" />
              <circle cx="95" cy="75" r="3" fill="#EDECE8" />
              <circle cx="105" cy="75" r="3" fill="#EDECE8" />
              <circle cx="115" cy="75" r="3" fill="#EDECE8" />
              <circle cx="125" cy="75" r="3" fill="#EDECE8" />
              <circle cx="135" cy="65" r="3" fill="#EDECE8" />
              <circle cx="145" cy="65" r="3" fill="#EDECE8" />
              <circle cx="155" cy="65" r="3" fill="#EDECE8" />
              <circle cx="165" cy="65" r="3" fill="#EDECE8" />
              <circle cx="175" cy="65" r="3" fill="#EDECE8" />
              <circle cx="185" cy="65" r="3" fill="#EDECE8" />
              <circle cx="195" cy="65" r="3" fill="#EDECE8" />
              <circle cx="205" cy="65" r="3" fill="#EDECE8" />
              <circle cx="215" cy="75" r="3" fill="#EDECE8" />
              <circle cx="225" cy="75" r="3" fill="#EDECE8" />
              <circle cx="235" cy="75" r="3" fill="#EDECE8" />
              <circle cx="245" cy="65" r="3" fill="#EDECE8" />
              <circle cx="255" cy="65" r="3" fill="#EDECE8" />
              <circle cx="265" cy="65" r="3" fill="#EDECE8" />
              <circle cx="275" cy="65" r="3" fill="#EDECE8" />
              <circle cx="285" cy="65" r="3" fill="#EDECE8" />
              <circle cx="295" cy="75" r="3" fill="#EDECE8" />
              <circle cx="305" cy="75" r="3" fill="#EDECE8" />
              <circle cx="325" cy="65" r="3" fill="#EDECE8" />
              <circle cx="335" cy="65" r="3" fill="#EDECE8" />
              <circle cx="345" cy="65" r="3" fill="#EDECE8" />
              <circle cx="355" cy="65" r="3" fill="#EDECE8" />
              <circle cx="365" cy="65" r="3" fill="#EDECE8" />
              <circle cx="375" cy="75" r="3" fill="#EDECE8" />
              <circle cx="385" cy="75" r="3" fill="#EDECE8" />
              <circle cx="395" cy="75" r="3" fill="#EDECE8" />
              <circle cx="405" cy="65" r="3" fill="#EDECE8" />
              <circle cx="415" cy="65" r="3" fill="#EDECE8" />
              <circle cx="425" cy="65" r="3" fill="#EDECE8" />
              <circle cx="435" cy="65" r="3" fill="#EDECE8" />
              <circle cx="445" cy="75" r="3" fill="#EDECE8" />
              <circle cx="455" cy="75" r="3" fill="#EDECE8" />
              <circle cx="465" cy="75" r="3" fill="#EDECE8" />
              <circle cx="475" cy="75" r="3" fill="#EDECE8" />
              <circle cx="485" cy="65" r="3" fill="#EDECE8" />
              <circle cx="495" cy="65" r="3" fill="#EDECE8" />
              <circle cx="505" cy="65" r="3" fill="#EDECE8" />
              <circle cx="515" cy="65" r="3" fill="#EDECE8" />
              <circle cx="525" cy="65" r="3" fill="#EDECE8" />
              <circle cx="535" cy="65" r="3" fill="#EDECE8" />
              <circle cx="545" cy="55" r="3" fill="#EDECE8" />
              <circle cx="555" cy="55" r="3" fill="#EDECE8" />
              <circle cx="565" cy="55" r="3" fill="#EDECE8" />
              <circle cx="575" cy="55" r="3" fill="#EDECE8" />
              <circle cx="585" cy="55" r="3" fill="#EDECE8" />
              <circle cx="595" cy="55" r="3" fill="#EDECE8" />
              <circle cx="605" cy="65" r="3" fill="#EDECE8" />
              <circle cx="615" cy="65" r="3" fill="#EDECE8" />
              <circle cx="625" cy="65" r="3" fill="#EDECE8" />
              <circle cx="635" cy="65" r="3" fill="#EDECE8" />
              <circle cx="315" cy="125" r="4" fill="#F87171" />
              <circle cx="315" cy="125" r="9" fill="none" stroke="#F87171" strokeWidth="1.2" />
              <animate attributeName="r" values="6;12;6" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
            </svg>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_360px),_1fr))] gap-5">
            <div className="relative flex flex-col gap-3.5 p-7 border border-line-soft bg-panel rounded-[22px] min-w-0 overflow-hidden" data-spot="rgba(61,59,243,0.12)">
              <span className="text-[13px] tracking-[0.16em] text-loss">
                FROZEN FRIDAY PRICE
              </span>
              <span className="text-[16px] leading-[1.6] text-ink">
                A stale price can hide risk. At the reopen, available buyers and accepted evidence matter.
              </span>
            </div>
            <div className="relative flex flex-col gap-3.5 p-7 border border-line-soft bg-panel rounded-[22px] min-w-0 overflow-hidden" data-spot="rgba(61,59,243,0.12)">
              <span className="text-[13px] tracking-[0.16em] text-loss">
                24/7 TOKEN PRICE
              </span>
              <span className="text-[16px] leading-[1.6] text-ink">
                One bad off-hours trade can liquidate a loan at a price no real market traded.
              </span>
            </div>
          </div>
          <p className="m-0 text-center text-[12px] tracking-[0.16em] text-muted">
            OFF-HOURS PRICE INPUT ·{' '}
            <span className="text-loss">
              NO CONFIRMED COMPARISON
            </span>
          </p>
          <p className="m-0 font-light leading-[1.06] tracking-[-0.02em] text-balance text-center text-[clamp(24px,_2.8vw,_38px)]">
            A BETTER PRICE ISN'T A BUYER.
          </p>
        </section>
      </Reveal>
      <Reveal delay={0} >
        <section className="flex flex-col gap-12 py-26 px-0" data-sec="2">
          <div className="flex flex-col items-center text-center gap-4 max-w-205 my-0 mx-auto">
            <span className="text-[13px] tracking-[0.16em] text-violet">
              SAME WEEKEND · SAME PRICES
            </span>
            <h2 className="m-0 text-[clamp(32px,_4vw,_54px)] font-light leading-[1.06] tracking-[-0.02em] text-balance">
              SAME PRICE DROP.
              <br />
              <span className="text-violet">
                DIFFERENT EXIT.
              </span>
            </h2>
            <p className="m-0 text-[16px] leading-[1.7] text-muted max-w-155 w-full">
              {v.homeLoanText}
              <br />
              Only accepted contract evidence is shown.
            </p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_340px),_1fr))] gap-5">
            <div className="relative flex flex-col gap-4 p-7 border border-line-soft bg-panel rounded-[22px] min-w-0" data-spot="rgba(61,59,243,0.12)">
              <span className="text-[13px] tracking-[0.16em] text-loss">
                STANDARD LENDING
              </span>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[clamp(32px,_3.6vw,_48px)] font-light leading-none">
                  {v.pStdSh}
                </span>
                <span className="text-[14px] text-muted">
                  {v.stockSymbol} kept
                </span>
              </div>
              <div className="flex h-3.5 rounded-[999px] overflow-hidden bg-loss">
                <div className="bg-ink rounded-[999px_0_0_999px]" style={{ width: v.pStdW }}></div>
              </div>
              <div className="flex flex-col">
                <div className="flex justify-between gap-3 py-3 px-0 border-b border-b-raise text-[14px]">
                  <span className="text-muted">
                    Owes
                  </span>
                  <span>
                    {v.pStdDebt}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-3 px-0 border-b border-b-raise text-[14px]">
                  <span className="text-muted">
                    Liquidator bonus
                  </span>
                  <span>
                    {v.pStdBonus}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-3 px-0 border-b border-b-raise text-[14px]">
                  <span className="text-muted">
                    Borrower stake
                  </span>
                  <span>
                    {v.pStdStake}
                  </span>
                </div>
              </div>
            </div>
            <div className="relative flex flex-col gap-4 p-7 border border-line bg-[rgba(61,59,243,0.10)] rounded-[22px] min-w-0" data-spot="rgba(61,59,243,0.12)">
              <span className="text-[13px] tracking-[0.16em] text-violet">
                WITH BELL
              </span>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[clamp(32px,_3.6vw,_48px)] font-light leading-none">
                  {v.pBellSh}
                </span>
                <span className="text-[14px] text-muted">
                  {v.stockSymbol} kept
                </span>
              </div>
              <div className="flex h-3.5 rounded-[999px] overflow-hidden bg-indigo-2">
                <div className="bg-ink rounded-[999px_0_0_999px]" style={{ width: v.pBellW }}></div>
              </div>
              <div className="flex flex-col">
                <div className="flex justify-between gap-3 py-3 px-0 border-b border-b-raise text-[14px]">
                  <span className="text-muted">
                    Owes
                  </span>
                  <span>
                    {v.pBellDebt}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-3 px-0 border-b border-b-raise text-[14px]">
                  <span className="text-muted">
                    Liquidator bonus
                  </span>
                  <span>
                    No liquidation bonus
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-3 px-0 border-b border-b-raise text-[14px]">
                  <span className="text-muted">
                    Borrower stake
                  </span>
                  <span>
                    {v.pBellStake}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3.5 text-center">
            <span className="text-[clamp(14px,_1.6vw,_18px)] tracking-[0.12em] w-full max-sm:min-h-9 max-sm:line-clamp-2" style={{ color: v.pResultC }}>
              {v.pResult}
            </span>
            <span className="text-[13px] text-faint">
              Historical prices. Outcomes computed live. Testnet demo; backup buyers are bots.
            </span>
            <button className="[font-family:inherit] text-[12px] tracking-[0.16em] inline-flex items-center gap-2.5 py-3.5 px-5.5 cursor-pointer text-ink bg-transparent border border-line rounded-[10px] [transition:border-color_200ms,_color_200ms] hover:border-violet hover:text-violet" onClick={v.goReplay}>
              <Icon name="play" size={13} />
              {' '}RUN THE REPLAY
            </button>
          </div>
          <h2 className="m-0 text-[clamp(32px,_4vw,_54px)] font-light leading-[1.06] tracking-[-0.02em] text-balance text-center mt-6">
            OTHERS FIND THE BUYER AFTER.
            <br />
            <span className="text-violet">
              BELL, BEFORE.
            </span>
          </h2>
          <div className="border border-line-soft bg-panel overflow-x-auto rounded-[22px]" data-spot="rgba(61,59,243,0.12)">
            <div className="min-w-140" role="table">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-4 py-4 px-5.5 border-b border-b-line-soft text-[12px] tracking-[0.14em] text-muted" role="row">
                <span></span>
                <span className="text-loss">
                  STANDARD LENDING
                </span>
                <span className="text-violet">
                  BELL
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-4 items-center py-4 px-5.5 border-b border-b-raise [transition:background-color_200ms] hover:bg-panel-2" role="row">
                <span className="text-[12px] tracking-[0.14em] text-muted">
                  BUYER
                </span>
                <span className="text-[14px] leading-[1.5] text-dim">
                  Found after the loan fails
                </span>
                <span className="text-[14px] leading-[1.5] text-ink">
                  Booked before the close
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-4 items-center py-4 px-5.5 border-b border-b-raise [transition:background-color_200ms] hover:bg-panel-2" role="row">
                <span className="text-[12px] tracking-[0.14em] text-muted">
                  CASH
                </span>
                <span className="text-[14px] leading-[1.5] text-dim">
                  Depends on who shows up
                </span>
                <span className="text-[14px] leading-[1.5] text-ink">
                  USDC locked in advance
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-4 items-center py-4 px-5.5 border-b border-b-raise [transition:background-color_200ms] hover:bg-panel-2" role="row">
                <span className="text-[12px] tracking-[0.14em] text-muted">
                  CLOSED MARKET
                </span>
                <span className="text-[14px] leading-[1.5] text-dim">
                  A stale or bad price decides
                </span>
                <span className="text-[14px] leading-[1.5] text-ink">
                  Covered loans can't be liquidated
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-4 items-center py-4 px-5.5 border-b border-b-raise [transition:background-color_200ms] hover:bg-panel-2" role="row">
                <span className="text-[12px] tracking-[0.14em] text-muted">
                  SETTLEMENT
                </span>
                <span className="text-[14px] leading-[1.5] text-dim">
                  Liquidator takes a 5.5% bonus
                </span>
                <span className="text-[14px] leading-[1.5] text-ink">
                  Only needed shares, at agreed prices
                </span>
              </div>
            </div>
          </div>
        </section>
      </Reveal>
      <Reveal delay={0} >
        <section className="flex flex-col gap-12 py-26 px-0" data-sec="3">
          <div className="flex flex-col items-center text-center gap-4 max-w-205 my-0 mx-auto">
            <h2 className="m-0 text-[clamp(32px,_4vw,_54px)] font-light leading-[1.06] tracking-[-0.02em] text-balance">
              THREE SIDES.
              <br />
              <span className="text-violet">
                ONE FUNDED EXIT.
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_280px),_1fr))] gap-5">
            <button className="flex flex-col gap-4 p-6 border border-line-soft bg-panel [transition:border-color_250ms] rounded-[22px] [font-family:inherit] text-[inherit] text-left cursor-pointer w-full hover:border-indigo-2" onClick={v.goBackup} data-tilt="" data-spot="rgba(61,59,243,0.12)">
              <span className="flex items-center justify-center w-11 h-11 rounded-[12px] bg-[#13301F] text-safe">
                <Icon name="vault" size={20} />
              </span>
              <span className="text-[17px] tracking-[0.08em]">
                BACKUP BUYER
              </span>
              <span className="text-[14px] leading-[1.6] text-muted">
                Lock USDC at your price. Earn a fee. Buy only if settlement is needed.
              </span>
              <span className="mt-auto inline-flex items-center gap-2 text-[12px] tracking-[0.12em] text-safe">
                POST AN OFFER{' '}
                <Icon name="arrow-right" size={13} />
              </span>
            </button>
            <button className="flex flex-col gap-4 p-6 border border-line-soft bg-panel [transition:border-color_250ms] rounded-[22px] [font-family:inherit] text-[inherit] text-left cursor-pointer w-full hover:border-indigo-2" onClick={v.goBorrow} data-tilt="" data-spot="rgba(61,59,243,0.12)">
              <span className="flex items-center justify-center w-11 h-11 rounded-[12px] bg-[#1C1B4A] text-violet">
                <Icon name="wallet" size={20} />
              </span>
              <span className="text-[17px] tracking-[0.08em]">
                BORROWER
              </span>
              <span className="text-[14px] leading-[1.6] text-muted">
                Keep your shares through the weekend. No forced closed-market sale.
              </span>
              <span className="mt-auto inline-flex items-center gap-2 text-[12px] tracking-[0.12em] text-violet">
                PROTECT A LOAN{' '}
                <Icon name="arrow-right" size={13} />
              </span>
            </button>
            <button className="flex flex-col gap-4 p-6 border border-line-soft bg-panel [transition:border-color_250ms] rounded-[22px] [font-family:inherit] text-[inherit] text-left cursor-pointer w-full hover:border-indigo-2" onClick={v.goLend} data-tilt="" data-spot="rgba(61,59,243,0.12)">
              <span className="flex items-center justify-center w-11 h-11 rounded-[12px] bg-[#3A2C10] text-warn">
                <Icon name="landmark" size={20} />
              </span>
              <span className="text-[17px] tracking-[0.08em]">
                LENDER
              </span>
              <span className="text-[14px] leading-[1.6] text-muted">
                Covered loans repay from cash locked before the close.
              </span>
              <span className="mt-auto inline-flex items-center gap-2 text-[12px] tracking-[0.12em] text-warn">
                SUPPLY USDC{' '}
                <Icon name="arrow-right" size={13} />
              </span>
            </button>
          </div>
        </section>
      </Reveal>
      <Reveal delay={0} >
        <section className="flex flex-col gap-12 pt-26 px-0 pb-12" data-sec="4">
          <div className="flex flex-col items-center text-center gap-4 max-w-205 my-0 mx-auto">
            <h2 className="m-0 text-[clamp(32px,_4vw,_54px)] font-light leading-[1.06] tracking-[-0.02em] text-balance">
              THREE RULES.
              <br />
              <span className="text-violet">
                ENFORCED BY CONTRACTS.
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_280px),_1fr))] gap-5">
            <div className="relative flex flex-col gap-3.5 p-7 border border-line-soft bg-panel rounded-[22px] min-w-0 overflow-hidden" data-tilt="" data-spot="rgba(61,59,243,0.12)">
              <span className="text-[34px] leading-none text-safe">
                01
              </span>
              <span className="text-[13px] tracking-[0.16em] text-safe">
                CASH BEFORE COVER
              </span>
              <span className="text-[15px] leading-[1.6] text-muted">
                A loan is covered only once its maximum debt, interest included, is locked in cash.
              </span>
            </div>
            <div className="relative flex flex-col gap-3.5 p-7 border border-line-soft bg-panel rounded-[22px] min-w-0 overflow-hidden" data-tilt="" data-spot="rgba(61,59,243,0.12)">
              <span className="text-[34px] leading-none text-safe">
                02
              </span>
              <span className="text-[13px] tracking-[0.16em] text-safe">
                NO CLOSED-MARKET LIQUIDATION
              </span>
              <span className="text-[15px] leading-[1.6] text-muted">
                Covered loans cannot be liquidated while the market is closed.
              </span>
            </div>
            <div className="relative flex flex-col gap-3.5 p-7 border border-line-soft bg-panel rounded-[22px] min-w-0 overflow-hidden" data-tilt="" data-spot="rgba(61,59,243,0.12)">
              <span className="text-[34px] leading-none text-safe">
                03
              </span>
              <span className="text-[13px] tracking-[0.16em] text-safe">
                PAID WITHOUT TOKEN TRANSFERS
              </span>
              <span className="text-[15px] leading-[1.6] text-muted">
                The lender is paid even if the stock token is paused.
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 text-center text-[12px] tracking-[0.16em] text-muted">
            <span>
              ONE DOLLAR BACKS ONE LOAN. NEVER TWO.
            </span>
            <span>
              AFTER THE CUTOFF, NO ONE CAN BUY COVER ON FRESH NEWS.
            </span>
          </div>
        </section>
      </Reveal>
      <Reveal delay={0} >
        <section className="flex flex-col gap-9 pt-20 px-0 pb-24" data-sec="5">
          <h2 className="m-0 text-[clamp(28px,_4.2vw,_56px)] font-light leading-[1.08] tracking-[-0.02em]">
            QUESTIONS
          </h2>
          <div className="border-t border-t-line">
            {v.faqs.map((f: any, i: number) => (
              <Fragment key={i}>
                <div className="border-b border-b-line-soft">
                  <button className="w-full grid grid-cols-[minmax(0,1fr)_24px] gap-4 items-center py-5 px-1 bg-transparent border-0 border-current [font-family:inherit] text-[clamp(14px,_1.4vw,_16px)] tracking-[0.06em] text-left cursor-pointer [transition:color_200ms] hover:text-violet" style={{ color: f.fg }} onClick={f.toggle} aria-expanded={f.aria === 'true'} aria-controls={f.id}>
                    <span>
                      {f.q}
                    </span>
                    <span className="relative block w-4.5 h-4.5">
                      <span className="absolute left-0.5 right-0.5 top-[8.5px] h-[1.5px] bg-current"></span>
                      <span className="absolute left-0.5 right-0.5 top-[8.5px] h-[1.5px] bg-current [transition:transform_420ms_cubic-bezier(0.22,1,0.36,1)]" style={{ transform: `rotate(${f.rot})` }}></span>
                    </span>
                  </button>
                  <div className="grid [transition:grid-template-rows_460ms_cubic-bezier(0.22,1,0.36,1)]" style={{ gridTemplateRows: f.rows }} id={f.id} role="region" aria-hidden={f.hidden === 'true'}>
                    <div className="overflow-hidden min-h-0">
                      <div className="pt-0 pr-10 pb-6 pl-1 text-[14px] leading-[1.7] text-muted max-w-205 text-pretty" style={{ opacity: f.op, transform: `translateY(${f.ty})`, filter: `blur(${f.blur})`, transition: `opacity 360ms cubic-bezier(0.22,1,0.36,1) ${f.delay}, transform 460ms cubic-bezier(0.22,1,0.36,1), filter 360ms cubic-bezier(0.22,1,0.36,1)` }}>
                        {f.a}
                      </div>
                    </div>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <a className="rounded-[10px] [font-family:inherit] text-[12px] tracking-[0.14em] inline-flex items-center gap-2.5 py-3 px-4.5 no-underline text-ink border border-line [transition:border-color_200ms,_color_200ms] hover:border-violet hover:text-violet" href="#">
              <Icon name="file-code-2" />
              {' '}VIEW CONTRACTS
            </a>
            <a className="rounded-[10px] [font-family:inherit] text-[12px] tracking-[0.14em] inline-flex items-center gap-2.5 py-3 px-4.5 no-underline text-ink border border-line [transition:border-color_200ms,_color_200ms] hover:border-violet hover:text-violet" href="#">
              <Icon name="book-open" />
              {' '}READ THE MECHANISM
            </a>
          </div>
        </section>
      </Reveal>
      <section className="relative isolate overflow-hidden ml-[calc(50%_-_50vw)] mr-[calc(50%_-_50vw)] pt-[clamp(72px,_11vh,_112px)] px-[max(24px,_calc(50vw_-_720px))] pb-14 flex flex-col gap-8 bg-indigo text-white" data-spark-color="#FFFFFF" data-sec="9">
        <DitherVeil rgb={[255,255,255]} alpha={0.22} pixelSize={5} className="absolute inset-0 -z-1" />
        <p className="m-0 text-[clamp(16px,_2vw,_24px)] text-violet-soft">
          THE MARKET WILL CLOSE AGAIN THIS FRIDAY.
        </p>
        <h2 className="m-0 text-[clamp(28px,_4.6vw,_62px)] font-light leading-[1.08] tracking-[-0.02em] text-balance">
          THIS TIME, THE BUYER IS ALREADY THERE.
        </h2>
        <div className="flex items-end gap-3">
          <span className="font-display text-[clamp(80px,_16vw,_220px)] leading-[0.85] tracking-[0.04em]">
            BELL
          </span>
          <span className="inline-block w-[clamp(14px,_2.2vw,_30px)] h-[clamp(58px,_11.5vw,_158px)] bg-white [animation:blink_1.06s_steps(1)_infinite]" aria-hidden="true"></span>
        </div>
        <span className="text-[clamp(13px,_1.4vw,_16px)] tracking-[0.24em]">
          BACKED BEFORE THE BELL.
        </span>
        <div className="flex flex-wrap gap-3">
          <button className="[font-family:inherit] text-[12px] tracking-[0.16em] inline-flex items-center gap-2.5 py-3.75 px-6 cursor-pointer text-indigo bg-white border border-white [background-image:linear-gradient(#0A0A0C,#0A0A0C)] [background-repeat:no-repeat] [background-size:0%_100%] [transition:background-size_420ms_cubic-bezier(0.22,1,0.36,1),_color_420ms,_border-color_420ms] rounded-[10px] hover:[background-size:100%_100%] hover:text-white hover:border-bg active:[transform:translateY(1px)]" onClick={v.goBorrow}>
            PROTECT A LOAN{' '}
            <Icon name="arrow-right" />
          </button>
          <button className="[font-family:inherit] text-[12px] tracking-[0.16em] inline-flex items-center gap-2.5 py-3.75 px-6 cursor-pointer text-white bg-transparent border border-white [background-image:linear-gradient(#FFFFFF,#FFFFFF)] [background-repeat:no-repeat] [background-size:0%_100%] [transition:background-size_420ms_cubic-bezier(0.22,1,0.36,1),_color_420ms] rounded-[10px] hover:[background-size:100%_100%] hover:text-indigo active:[transform:translateY(1px)]" onClick={v.goBackup}>
            FUND A BACKUP
          </button>
        </div>
      </section>
    </main>
  );
}
