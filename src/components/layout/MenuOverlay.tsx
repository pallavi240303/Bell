import { Fragment } from 'react';
import { Icon } from '@/components/ui/Icon';
import { TypeLine } from '@/components/ui/TypeLine';
import { useBell } from '@/state/useBell';

/** Full-screen menu: one row per page, the hovered row grows. */
export function MenuOverlay() {
  const v = useBell();
  return (
    <div className="fixed inset-0 z-[100] bg-indigo text-white flex flex-col h-[100dvh] overflow-hidden [animation:fadeIn_160ms_linear]" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="max-w-380 w-full my-0 mx-auto py-3 px-[clamp(16px,_3vw,_40px)] flex items-center gap-1.5 [scrollbar-gutter:stable]">
        <span className="flex items-center gap-1.5 py-2 px-0">
          <span className="font-display text-[24px] font-normal tracking-[0.1em] leading-none">
            BELL
          </span>
          <span className="inline-block w-2 h-3.75 bg-white [animation:blink_1.06s_steps(1)_infinite]" aria-hidden="true"></span>
        </span>
        <button className="ml-auto w-9.5 h-9.5 flex-none p-0 bg-indigo border border-white rounded-[10px] text-white [font-family:inherit] text-[15px] cursor-pointer flex items-center justify-center [transition:background-color_200ms,_color_200ms] hover:bg-ink hover:text-indigo" onClick={v.closeMenu} aria-label="Close menu">
          <Icon name="x" size={16} />
        </button>
      </div>
      <nav className="max-w-380 w-full my-0 mx-auto py-0 px-6 flex-1 min-h-0 flex flex-col justify-stretch gap-0" aria-label="All pages">
        {v.menuItems.map((it: any, i: number) => (
          <Fragment key={i}>
            <button className="flex-[1_1_0] min-h-0 flex items-center gap-5 bg-transparent border-0 border-current border-b border-b-[rgba(255,255,255,0.28)] text-white [font-family:inherit] text-left cursor-pointer [transition:transform_300ms_cubic-bezier(0.22,1,0.36,1),_padding_500ms_cubic-bezier(0.22,1,0.36,1),_color_200ms] hover:text-white hover:[transform:translateX(8px)]" style={{ padding: `calc(clamp(4px, 1.2vh, 12px) * ${it.scale}) 0` }} onClick={it.go} onMouseEnter={it.enter} onFocus={it.enter} onMouseLeave={v.menuLeave} onBlur={v.menuLeave} aria-label={it.label} aria-current={it.aria === 'false' ? undefined : (it.aria as 'page' | 'step')}>
              <span className="text-[12px] tracking-[0.16em] text-violet-soft min-w-7">
                {it.num}
              </span>
              <span className="font-light leading-[1.1] whitespace-nowrap inline-block [transition:font-size_500ms_cubic-bezier(0.22,1,0.36,1),_letter-spacing_500ms_cubic-bezier(0.22,1,0.36,1),_opacity_300ms]" style={{ fontSize: `calc(clamp(22px, min(7vw, 7.5vh), 80px) * ${it.scale})`, letterSpacing: it.ls, opacity: it.op }}>
                <TypeLine text={it.label} delay={it.delay} />
              </span>
              <span className="ml-auto text-[11px] tracking-[0.18em] text-violet-soft">
                {it.mark}
              </span>
            </button>
          </Fragment>
        ))}
      </nav>
      <div className="max-w-380 w-full my-0 mx-auto py-3.5 px-6 flex flex-wrap justify-between gap-3 text-[11px] tracking-[0.18em] text-violet-soft border-t border-t-[rgba(255,255,255,0.28)]">
        <span>
          BACKED BEFORE THE BELL.
        </span>
      </div>
    </div>
  );
}
