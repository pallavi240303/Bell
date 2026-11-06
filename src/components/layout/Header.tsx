import { Icon } from '@/components/ui/Icon';
import { TypeLine } from '@/components/ui/TypeLine';
import { useBell } from '@/state/useBell';

/** Sticky header: logo, primary action, menu button, live session bar and reading progress. */
export function Header() {
  const v = useBell();
  return (
    <header className="sticky top-0 z-50 bg-[rgba(10,10,12,0.82)] backdrop-blur-[10px] border-b border-b-line-soft">
      <div className="max-w-380 my-0 mx-auto py-3 px-[clamp(16px,_3vw,_40px)] flex items-center gap-3">
        <button className="flex items-center gap-1.5 py-2 px-0 bg-transparent border-0 border-current text-ink [font-family:inherit] cursor-pointer" onClick={v.goHome} aria-label="BELL home">
          <span className="font-display text-[24px] font-normal tracking-[0.1em] leading-none">
            BELL
          </span>
          <span className="inline-block w-2 h-3.75 bg-indigo [animation:blink_1.06s_steps(1)_infinite]" aria-hidden="true"></span>
        </button>
        <div className="flex-1"></div>
        <button className="[font-family:inherit] text-[11px] tracking-[0.16em] text-white bg-indigo border border-indigo rounded-[10px] py-2.5 px-3.5 cursor-pointer whitespace-nowrap [transition:background-color_200ms] hover:bg-indigo-2" onClick={v.goBorrow}>
          PROTECT A LOAN
        </button>
        <button className="w-9.5 h-9.5 flex-none flex items-center justify-center p-0 bg-transparent text-ink border border-line rounded-[10px] cursor-pointer [transition:border-color_200ms] hover:border-ink" onClick={v.openMenu} aria-label="Open menu" aria-expanded={v.menuAria === 'true'}>
          <Icon name="menu" size={18} />
        </button>
      </div>
      <div className="border-t border-t-line-soft py-1.75 px-6 flex flex-wrap justify-center items-center gap-y-2 gap-x-2.5 text-[10px] tracking-[0.16em]">
        <span className="relative inline-block w-1.5 h-1.5 flex-none">
          <span className="absolute inset-0 rounded-[50%]" style={{ background: v.statusColor }}></span>
          <span className="absolute inset-0 rounded-[50%] [animation:pulse_2s_cubic-bezier(0.22,1,0.36,1)_infinite]" style={{ background: v.statusColor }}></span>
        </span>
        <span>
          <TypeLine text={v.statusWord} />
        </span>
        <span className="text-muted">
          · {v.cdLabel} {v.cdTime}
        </span>
        {v.wide && (
          <>
            <span className="text-faint ml-3.5 pl-3.5 border-l border-l-line">
              UNSIGNED PREPARATION → WALLET → CONTRACT
            </span>
          </>
        )}
        <span className="inline-flex items-center gap-0.75 ml-3.5 p-0.5 border border-line rounded-[10px]">
          <button className="rounded-[7px] [font-family:inherit] text-[10px] tracking-[0.14em] py-1 px-2 border-0 border-current cursor-pointer [transition:background-color_200ms,_color_200ms]" style={{ color: v.liveFg, background: v.liveBg }} onClick={v.setLive} aria-pressed={v.liveAria === 'true'}>
            WALLET{' '}
            <span style={{ color: v.liveDot }}>
              ●
            </span>
          </button>
          <span className="inline-flex items-center gap-0.5 py-0 px-1.5 rounded-[7px] [transition:background-color_200ms,_color_200ms]" style={{ color: v.replayFg, background: v.replayBg }}>
            <button className="[font-family:inherit] text-[10px] tracking-[0.14em] py-1 px-0 border-0 border-current bg-transparent text-[inherit] cursor-pointer" onClick={v.setReplay} aria-pressed={v.replayAria === 'true'}>
              REPLAY:
            </button>
            <select className="[font-family:inherit] text-[10px] tracking-[0.12em] bg-transparent text-[inherit] border-0 border-current py-1 px-0.5 cursor-pointer appearance-none" aria-label="Replay weekend" value={v.scenario} onChange={v.onScenario}>
              <option value="evidence">
                ACCEPTED EVIDENCE
              </option>
              <option value="quiet">
                HISTORICAL INPUT
              </option>
            </select>
            <Icon name="chevron-down" size={10} />
          </span>
        </span>
      </div>
      {v.isHome && (
        <>
          <div className="absolute left-0 -bottom-0.25 h-0.5 bg-indigo [transition:width_500ms_cubic-bezier(0.22,1,0.36,1)]" style={{ width: v.readPct }} aria-hidden="true"></div>
        </>
      )}
    </header>
  );
}
