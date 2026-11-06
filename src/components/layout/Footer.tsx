import { useBell } from '@/state/useBell';

/** Slim footer with sources, shown on every page except home. */
export function Footer() {
  const v = useBell();
  return (
    <footer className="pt-8 px-[max(24px,_calc(50vw_-_720px))] pb-7 bg-indigo border-t border-t-[rgba(255,255,255,0.22)] flex flex-col gap-5 text-[12px] tracking-[0.12em] leading-[1.7] text-[#C9C8FF]" id="sources">
      <div className="flex flex-wrap justify-between gap-4">
        <span className="text-white">
          BELL · CONTRACT SETTLEMENT · CONNECTED WALLET
        </span>
        <nav className="flex flex-wrap gap-5" aria-label="Footer">
          <a className="text-white" href="#">
            DOCS
          </a>
          <a className="text-white" href="#">
            CONTRACTS
          </a>
          <a className="text-white" href="#">
            GITHUB
          </a>
          <a className="text-white" href="#">
            ETHGLOBAL MUMBAI
          </a>
        </nav>
      </div>
      <span>
        {v.labels.network} · {v.labels.receiver} · {v.labels.clock}
      </span>
    </footer>
  );
}
