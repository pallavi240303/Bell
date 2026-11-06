import { Fragment } from 'react';
import { Icon } from '@/components/ui/Icon';
import { TypeLine } from '@/components/ui/TypeLine';
import { TickNumber } from '@/components/ui/TickNumber';
import { useBell } from '@/state/useBell';

/** Accepted evidence beside current contract state. */
export function ReplayPage() {
  const v = useBell();
  return (
    <main className="max-w-380 my-0 mx-auto pt-8 px-[clamp(16px,_3vw,_40px)] pb-20 flex flex-col gap-8 [animation:pageIn_240ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="flex flex-col gap-2.5">
        <h1 className="m-0 text-[clamp(26px,_3.4vw,_44px)] font-light tracking-[-0.01em] leading-[1.1]">
          REPLAY · {v.scLabel} · {v.scDates}
        </h1>
        <p className="m-0 text-[15px] leading-[1.6] text-muted">
          Accepted reports and current contract state. Missing evidence stays unavailable.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-y-3.5 gap-x-7 border border-line-soft bg-panel py-3 px-4.5 rounded-[16px]">
        <div className="relative flex-[1_1_340px] min-w-70 h-13" aria-label="Session timeline" role="img">
          <div className="absolute left-0 w-[44%] top-6.5 h-0.25 bg-line"></div>
          <div className="absolute left-[44%] w-[46%] top-6.5 [border-top:1px_dashed_#34343D]"></div>
          <div className="absolute left-[90%] right-0 top-6.5 h-0.25 bg-line"></div>
          <div className="absolute left-0 top-6.5 h-0.25 bg-ink [transition:width_700ms_cubic-bezier(0.22,1,0.36,1)]" style={{ width: v.nowPct }}></div>
          <div className="absolute left-[10%] top-5.5 w-0.25 h-2.25" style={{ background: v.tk1 }}></div>
          <span className="absolute left-[10%] top-1 text-[10px] tracking-[0.12em] whitespace-nowrap [transform:translateX(-4px)] [transition:color_400ms]" style={{ color: v.tk1 }}>
            SCHEDULE
          </span>
          <div className="absolute left-[34%] top-5.5 w-0.25 h-2.25" style={{ background: v.tk2 }}></div>
          <span className="absolute left-[34%] top-8.75 text-[10px] tracking-[0.12em] whitespace-nowrap [transform:translateX(-50%)] [transition:color_400ms]" style={{ color: v.tk2 }}>
            CONFIGURED CLOSE
          </span>
          <div className="absolute left-[44%] top-5 w-0.25 h-3.25" style={{ background: v.tk3 }}></div>
          <span className="absolute left-[44%] top-1 text-[10px] tracking-[0.12em] whitespace-nowrap [transform:translateX(-50%)] [transition:color_400ms]" style={{ color: v.tk3 }}>
            CLOSE
          </span>
          <span className="absolute left-[67%] top-8.75 text-[10px] tracking-[0.12em] whitespace-nowrap [transform:translateX(-50%)] text-muted">
            WEEKEND
          </span>
          <div className="absolute left-[90%] top-5 w-0.25 h-3.25" style={{ background: v.tk4 }}></div>
          <span className="absolute left-[90%] top-1 text-[10px] tracking-[0.12em] whitespace-nowrap [transform:translateX(-100%)] pr-1 [transition:color_400ms]" style={{ color: v.tk4 }}>
            BENCHMARK
          </span>
          <div className="absolute top-5.25 [transition:left_700ms_cubic-bezier(0.22,1,0.36,1)]" style={{ left: v.nowPct }}>
            <span className="absolute -left-1.25 top-0 w-2.75 h-2.75 bg-ink"></span>
            <span className="absolute -left-1.25 top-0 w-2.75 h-2.75 border border-ink [animation:pulse_2s_cubic-bezier(0.22,1,0.36,1)_infinite]"></span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 min-w-34">
          <span className="text-[10px] tracking-[0.16em] text-muted whitespace-nowrap">
            {v.cdLabel}
          </span>
          <span className="text-[15px] tracking-[0.04em]">
            {v.cdTime}
          </span>
        </div>
        <div className="flex gap-0.75 p-0.75 border border-line rounded-[12px] overflow-hidden">
          <button className="rounded-[8px] [font-family:inherit] text-[11px] tracking-[0.16em] py-2.25 px-3 border-0 border-current cursor-pointer [transition:background-color_200ms,_color_200ms]" style={{ color: v.liveFg, background: v.liveBg }} onClick={v.setLive} aria-pressed={v.liveAria === 'true'}>
            WALLET{' '}
            <span style={{ color: v.liveDot }}>
              ●
            </span>
          </button>
          <div className="flex items-center gap-1 py-0 px-2.5 rounded-[8px] [transition:background-color_200ms,_color_200ms]" style={{ color: v.replayFg, background: v.replayBg }}>
            <button className="rounded-[8px] [font-family:inherit] text-[11px] tracking-[0.16em] py-2.25 px-0 border-0 border-current bg-transparent text-[inherit] cursor-pointer" onClick={v.setReplay} aria-pressed={v.replayAria === 'true'}>
              REPLAY:
            </button>
            <select className="[font-family:inherit] text-[11px] tracking-[0.12em] bg-transparent text-[inherit] border-0 border-current py-2.25 px-0.5 cursor-pointer appearance-none" aria-label="Replay weekend" value={v.scenario} onChange={v.onScenario} disabled={!v.replayControlsEnabled}>
              <option value="evidence">
                ACCEPTED EVIDENCE
              </option>
              <option value="quiet">
                HISTORICAL INPUT
              </option>
            </select>
            <Icon name="chevron-down" size={12} />
          </div>
        </div>
      </div>
      <nav className="grid grid-cols-4 gap-2.5" aria-label="Story chapters">
        {v.chapters.map((c: any, i: number) => (
          <Fragment key={i}>
            <button className="flex flex-col gap-2.5 py-1 px-0 bg-transparent border-0 border-current cursor-pointer text-left [font-family:inherit] [transition:color_300ms] hover:text-ink" style={{ color: c.fg }} onClick={c.go} aria-current={c.aria === 'false' ? undefined : (c.aria as 'page' | 'step')} disabled={!v.replayControlsEnabled}>
              <span className="relative block h-0.5 bg-line-soft overflow-hidden">
                <span className="absolute left-0 top-0 bottom-0 bg-ink [transition:width_600ms_cubic-bezier(0.22,1,0.36,1)]" style={{ width: c.fill }}></span>
              </span>
              <span className="text-[10px] tracking-[0.18em] leading-[1.5]">
                {c.num} {c.label}
              </span>
            </button>
          </Fragment>
        ))}
      </nav>
      <section className="flex flex-col gap-4.5" aria-live="polite">
        <div className="flex justify-between gap-3 flex-wrap text-[11px] tracking-[0.18em] text-muted">
          <span>
            {v.evClock} · BLOCK TIME
          </span>
          <span>
            EVENT {v.evNum}
          </span>
        </div>
        <h1 className="m-0 text-[clamp(24px,_4vw,_44px)] font-normal tracking-[0.01em] leading-[1.15] min-h-[1.15em] [transition:color_300ms] text-balance" style={{ color: v.evColor }} aria-label={v.evTitle}>
          <TypeLine text={v.evTitle} />
        </h1>
        <div className="min-h-13">
          {v.evBody}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms,_transform_120ms,_translate_260ms_cubic-bezier(0.22,1,0.36,1)] py-3 px-3.5 hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onPrev} aria-label="Previous event" disabled={!v.replayControlsEnabled}>
            <Icon name="arrow-left" />
          </button>
          {v.canNext && (
            <>
              <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms,_transform_120ms,_translate_260ms_cubic-bezier(0.22,1,0.36,1)] py-3 px-5.5 hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onNext}>
                NEXT EVENT{' '}
                <Icon name="arrow-right" />
              </button>
            </>
          )}
          {v.cantNext && (
            <>
              <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-muted bg-transparent border border-line rounded-[10px] inline-flex items-center gap-2.5 py-3 px-5.5 cursor-not-allowed" disabled>
                NEXT EVENT{' '}
                <Icon name="arrow-right" />
              </button>
            </>
          )}
          {v.canPlay && (
            <>
              <button className="[font-family:inherit] text-[12px] tracking-[0.16em] text-ink bg-transparent [background-image:linear-gradient(#3D3BF3,#3D3BF3)] [background-repeat:no-repeat] [background-size:0%_100%] border border-ink rounded-[10px] inline-flex items-center justify-center gap-2.5 py-3 px-4.5 cursor-pointer [transition:background-size_450ms_cubic-bezier(0.22,1,0.36,1),_color_450ms,_transform_120ms,_translate_260ms_cubic-bezier(0.22,1,0.36,1)] min-w-26 hover:[background-size:100%_100%] hover:text-white hover:border-indigo active:[transform:translateY(1px)]" onClick={v.onPlay} aria-pressed={v.playAria === 'true'}>
                <Icon name={v.playIcon} size={13} />
                {' '}{v.playLabel}
              </button>
            </>
          )}
          <button className="[font-family:inherit] text-[11px] tracking-[0.16em] text-muted bg-transparent border-0 border-current py-3 px-2 cursor-pointer [transition:color_200ms] hover:text-ink" onClick={v.onReset} disabled={!v.replayControlsEnabled}>
            REFRESH
          </button>
          <span className="inline-flex items-center gap-2 ml-2 text-[11px] tracking-[0.14em] text-muted">
            WEEKEND{' '}
            <select className="[font-family:inherit] text-[11px] tracking-[0.12em] bg-panel text-ink border border-line rounded-[8px] py-1.75 px-2 cursor-pointer" aria-label="Weekend" value={v.scenario} onChange={v.onScenario} disabled={!v.replayControlsEnabled}>
              <option value="evidence">
                ACCEPTED EVIDENCE
              </option>
              <option value="quiet">
                QUIET WEEKEND
              </option>
            </select>
          </span>
          <label className="inline-flex items-center gap-2.5 text-[11px] tracking-[0.14em] text-muted">
            REPORT INPUT{' '}
            <input className="w-35 accent-indigo-2 cursor-pointer" type="range" min="90" max="160" step="0.01" value={v.monPctV} onChange={v.onMonPct} aria-label="Monday open price" disabled={!v.replayControlsEnabled} />
            <span className="text-ink min-w-30">
              {v.monPctFmt} · {v.monPxFmt}
            </span>
          </label>
          {v.cantNext && (
            <>
              <span className="text-[10px] tracking-[0.14em] text-muted">
                {v.nextReason}
              </span>
            </>
          )}
          <div className="flex items-center ml-auto" role="group" aria-label="Events">
            {v.progress.map((p: any, i: number) => (
              <Fragment key={i}>
                <button className="py-2.5 px-0.5 bg-transparent border-0 border-current cursor-pointer" onClick={p.go} aria-label={p.label} disabled={!v.replayControlsEnabled}>
                  <span className="block h-1 [transition:width_300ms_cubic-bezier(0.22,1,0.36,1),_background-color_300ms]" style={{ width: p.w, background: p.bg }}></span>
                </button>
              </Fragment>
            ))}
          </div>
        </div>
      </section>
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_420px),_1fr))] gap-6">
        <section className="relative border border-line-soft bg-panel p-6 flex flex-col gap-6 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="Baseline market">
          {v.base.flashEl}
          <div className="flex flex-wrap justify-between items-center gap-3 min-h-9">
            <div className="flex flex-col gap-1">
              <span className="text-[15px] tracking-[0.3em] font-medium">
                BASELINE
              </span>
              <span className="text-[10px] tracking-[0.18em] text-muted">
                NORMAL LENDING MARKET
              </span>
            </div>
            <div className="relative grid grid-cols-2 gap-0.75 p-0.75 border border-line rounded-[12px] overflow-hidden isolate" role="group" aria-label="Baseline oracle">
              <span className="absolute top-0.75 bottom-0.75 left-0.75 w-[calc(50%_-_4.5px)] rounded-[8px] bg-indigo z-0 [transition:transform_320ms_cubic-bezier(0.22,1,0.36,1)]" style={{ transform: `translateX(${v.oracleKnob})` }} aria-hidden="true"></span>
              <button className="relative z-[1] rounded-[8px] [font-family:inherit] text-[10px] tracking-[0.14em] py-1.75 px-3 border-0 border-current cursor-pointer bg-transparent [transition:color_200ms] whitespace-nowrap" style={{ color: v.frozenFg }} onClick={v.setFrozen} aria-pressed={v.frozenAria === 'true'} disabled={!v.replayControlsEnabled}>
                FROZEN
              </button>
              <button className="relative z-[1] rounded-[8px] [font-family:inherit] text-[10px] tracking-[0.14em] py-1.75 px-3 border-0 border-current cursor-pointer bg-transparent [transition:color_200ms] whitespace-nowrap" style={{ color: v.liveOFg }} onClick={v.setLiveOracle} aria-pressed={v.liveOAria === 'true'} disabled={!v.replayControlsEnabled}>
                LIVE 24/7
              </button>
            </div>
          </div>
          <div className="flex items-baseline gap-2.5 flex-wrap text-[12px] tracking-[0.12em] text-muted">
            <span>
              {v.stockSymbol}
            </span>
            <span className="text-[22px] text-ink tracking-[0]">
              <TickNumber value={v.base.pxFmt}  />
            </span>
            {v.base.pxChip}
            <span className="ml-auto text-[10px] tracking-[0.16em]">
              {v.base.pxSrc}
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-start">
            <div className="flex flex-col gap-2 min-w-0">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                BORROWER KEEPS
              </span>
              <div className="flex items-baseline gap-2.5 whitespace-nowrap">
                <span className="text-[clamp(34px,_4.6vw,_52px)] font-light tracking-[-0.02em] leading-none">
                  <TickNumber value={v.base.shFmt}  />
                </span>
                <span className="text-[12px] text-muted">
                  {v.stockSymbol}
                </span>
              </div>
              <div className="h-5.5 flex items-center">
                {v.base.shChip}
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                OWES
              </span>
              <span className="text-[20px] whitespace-nowrap leading-[1.6]">
                <TickNumber value={v.base.debtFmt}  />
              </span>
              <div className="h-5.5 flex items-center">
                {v.base.debtChip}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="relative h-2.5 border border-line">
              <div className="absolute left-0 top-0 bottom-0 [transition:width_700ms_cubic-bezier(0.22,1,0.36,1),_background-color_400ms]" style={{ width: v.base.barW, background: v.base.barColor }}></div>
              <div className="absolute left-[70%] -top-1.25 -bottom-1.25 w-0.25 bg-ink"></div>
            </div>
            <div className="flex justify-between gap-3 text-[10px] tracking-[0.18em] text-muted">
              <span>
                DEBT{' '}
                <span className="[transition:color_300ms]" style={{ color: v.base.ratioColor }}>
                  <TickNumber value={v.base.ratioFmt}  />
                </span>
                {' '}OF VALUE
              </span>
              <span>
                CONTRACT LIMIT
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-t-line-soft pt-4.5 min-h-14">
            {v.base.badgeEl}
            <span className="text-[11px] tracking-[0.14em] text-pretty" style={{ color: v.base.noteColor }}>
              {v.base.note}
            </span>
          </div>
        </section>
        <section className="relative border border-line bg-panel p-6 flex flex-col gap-6 min-w-0 rounded-[16px] before:content-[''] before:absolute before:-top-0.25 before:-left-0.25 before:w-2.5 before:h-2.5 before:border-t before:border-t-ink before:border-l before:border-l-ink before:pointer-events-none after:content-[''] after:absolute after:-bottom-0.25 after:-right-0.25 after:w-2.5 after:h-2.5 after:border-b after:border-b-ink after:border-r after:border-r-ink after:pointer-events-none" data-spot="rgba(61,59,243,0.10)" aria-label="BELL market">
          {v.bell.flashEl}
          <div className="flex flex-wrap justify-between items-center gap-3 min-h-9">
            <div className="flex flex-col gap-1">
              <span className="text-[15px] tracking-[0.3em] font-medium">
                BELL
              </span>
              <span className="text-[10px] tracking-[0.18em] text-muted">
                WITH BACKUP BUYERS
              </span>
            </div>
            {v.bell.shield && (
              <>
                <div className="flex items-center gap-2 text-safe text-[10px] tracking-[0.16em] [animation:riseIn_400ms_cubic-bezier(0.22,1,0.36,1)_both]">
                  <Icon name="shield-check" size={18} className="[animation:stamp_420ms_cubic-bezier(0.22,1,0.36,1)_both]" />
                  HELD UNTIL OPENING BELL
                </div>
              </>
            )}
          </div>
          <div className="flex items-baseline gap-2.5 flex-wrap text-[12px] tracking-[0.12em] text-muted">
            <span>
              {v.stockSymbol}
            </span>
            <span className="text-[22px] text-ink tracking-[0]">
              <TickNumber value={v.bell.pxFmt}  />
            </span>
            {v.bell.pxChip}
            <span className="ml-auto text-[10px] tracking-[0.16em]">
              {v.bell.pxSrc}
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-start">
            <div className="flex flex-col gap-2 min-w-0">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                BORROWER KEEPS
              </span>
              <div className="flex items-baseline gap-2.5 whitespace-nowrap">
                <span className="text-[clamp(34px,_4.6vw,_52px)] font-light tracking-[-0.02em] leading-none">
                  <TickNumber value={v.bell.shFmt}  />
                </span>
                <span className="text-[12px] text-muted">
                  {v.stockSymbol}
                </span>
              </div>
              <div className="h-5.5 flex items-center">
                {v.bell.shChip}
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                OWES
              </span>
              <span className="text-[20px] whitespace-nowrap leading-[1.6]">
                <TickNumber value={v.bell.debtFmt}  />
              </span>
              <div className="h-5.5 flex items-center">
                {v.bell.debtChip}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="relative h-2.5 border border-line">
              <div className="absolute left-0 top-0 bottom-0 [transition:width_700ms_cubic-bezier(0.22,1,0.36,1),_background-color_400ms]" style={{ width: v.bell.barW, background: v.bell.barColor }}></div>
              <div className="absolute left-[70%] -top-1.25 -bottom-1.25 w-0.25 bg-ink"></div>
            </div>
            <div className="flex justify-between gap-3 text-[10px] tracking-[0.18em] text-muted">
              <span>
                DEBT{' '}
                <span className="[transition:color_300ms]" style={{ color: v.bell.ratioColor }}>
                  <TickNumber value={v.bell.ratioFmt}  />
                </span>
                {' '}OF VALUE
              </span>
              <span>
                CONTRACT LIMIT
              </span>
            </div>
          </div>
          {v.bell.notFlow && (
            <>
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap justify-between items-baseline gap-2">
                  <span className="text-[10px] tracking-[0.18em] text-muted">
                    CASH LOCKED BEHIND LOAN
                  </span>
                  <span className="flex items-baseline gap-2">
                    {v.bell.lockChip}
                    <span className="text-[17px] [transition:color_300ms]" style={{ color: v.bell.lockColor }}>
                      <TickNumber value={v.bell.lockFmt}  />
                    </span>
                    <span className="text-[11px] text-muted">
                      / {v.needFmt}
                    </span>
                  </span>
                </div>
                <div className="flex h-6 border border-line p-0.5">
                  {v.segs.map((s: any, i: number) => (
                    <Fragment key={i}>
                      <div className="relative flex-none h-full overflow-hidden [transition:width_800ms_cubic-bezier(0.22,1,0.36,1)]" style={{ width: s.w }}>
                        <div className="absolute top-0 bottom-0 left-0 right-0.5 bg-safe-deep text-white text-[10px] font-semibold tracking-[0.1em] flex items-center py-0 px-1.5 whitespace-nowrap overflow-hidden" title={s.title}>
                          {s.label}
                        </div>
                      </div>
                    </Fragment>
                  ))}
                </div>
                {v.hasRej && (
                  <>
                    <span className="text-[11px] tracking-[0.08em] text-loss [animation:riseIn_400ms_both]">
                      <Icon name="x" size={12} />
                      {' '}{v.lowballLabel}
                    </span>
                  </>
                )}
              </div>
            </>
          )}
          {v.bell.flow && (
            <>
              <div className="flex flex-col gap-2.5 [animation:riseIn_400ms_both]">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] tracking-[0.14em] py-2 px-2.5 border border-line whitespace-nowrap">
                    RAHUL'S DESK
                  </span>
                  <div className="relative flex-1 h-0.25 bg-line">
                    <span className="absolute -top-0.5 w-1.25 h-1.25 bg-safe-deep [animation:flow_1.5s_linear_infinite]"></span>
                    <span className="absolute -top-0.5 w-1.25 h-1.25 bg-safe-deep [animation:flow_1.5s_linear_0.5s_infinite]"></span>
                    <span className="absolute -top-0.5 w-1.25 h-1.25 bg-safe-deep [animation:flow_1.5s_linear_1s_infinite]"></span>
                  </div>
                  <span className="text-[10px] tracking-[0.14em] py-2 px-2.5 border border-[#15803D] text-safe whitespace-nowrap">
                    LENDER
                  </span>
                </div>
                <span className="text-[11px] tracking-[0.12em] text-muted">
                  {v.bell.flowText}
                </span>
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-t-line-soft pt-4.5 min-h-14">
            {v.bell.badgeEl}
            <span className="text-[11px] tracking-[0.14em] text-pretty" style={{ color: v.bell.noteColor }}>
              {v.bell.note}
            </span>
          </div>
        </section>
      </div>
      {v.outcome.show && (
        <>
          <section className="[border-top:3px_double_#34343D] [border-bottom:3px_double_#34343D] py-6 px-0 grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_220px),_1fr))] gap-5 items-end [animation:riseIn_500ms_cubic-bezier(0.22,1,0.36,1)_both]" aria-label="Outcome">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                BASELINE · BORROWER KEEPS
              </span>
              <span className="text-[28px] font-light text-loss">
                {v.outcome.base}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-[0.18em] text-muted">
                BELL · BORROWER KEEPS
              </span>
              <span className="text-[28px] font-light text-safe">
                {v.outcome.bell}
              </span>
            </div>
            <span className="text-[15px] tracking-[0.06em]" style={{ color: v.outcome.color }}>
              {v.outcome.diff}
            </span>
          </section>
        </>
      )}
      <section className="flex flex-col" aria-label="Event log">
        <button className="flex justify-between gap-3 py-3.5 px-0 bg-transparent border-0 border-current border-t border-t-line-soft text-muted [font-family:inherit] text-[11px] tracking-[0.2em] cursor-pointer [transition:color_200ms] hover:text-ink" onClick={v.toggleLog} aria-expanded={v.logAria === 'true'}>
          <span>
            EVENT LOG · <span>{v.logCount}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            {v.logArrow}{' '}
            <Icon name={v.logIcon} size={13} />
          </span>
        </button>
        {v.showLog && (
          <>
            <div className="[animation:riseIn_300ms_both]">
              {v.log.map((l: any, i: number) => (
                <Fragment key={i}>
                  <div className="grid grid-cols-[minmax(118px,_auto)_minmax(0,1fr)] gap-5 py-2.5 px-0 border-t border-t-line-soft text-[12px] leading-[1.6]">
                    <span className="text-muted tracking-[0.08em] whitespace-nowrap">
                      {l.t}
                    </span>
                    <span className="text-pretty" style={{ color: l.color }}>
                      {l.x}
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
