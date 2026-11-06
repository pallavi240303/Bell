import { AppEffects } from '@/components/layout/AppEffects';
import { Header } from '@/components/layout/Header';
import { PageTransition } from '@/components/layout/PageTransition';
import { Footer } from '@/components/layout/Footer';
import { MenuOverlay } from '@/components/layout/MenuOverlay';
import { HomePage } from '@/pages/HomePage';
import { ReplayPage } from '@/pages/ReplayPage';
import { BorrowPage } from '@/pages/BorrowPage';
import { BuyersPage } from '@/pages/BuyersPage';
import { LendPage } from '@/pages/LendPage';
import { ControlPage } from '@/pages/ControlPage';
import { useBell, useBellRuntime } from '@/state/useBell';

export default function App() {
  useBellRuntime();
  const v = useBell();

  return (
    <div className="min-h-screen text-ink [font-family:'Geist_Mono',_ui-monospace,_monospace] tabular-nums">
      <AppEffects />
      <Header />
      {v.actionStatus && (
        <div role="status" aria-live="polite" className="max-w-380 my-0 mx-auto px-[clamp(16px,_3vw,_40px)] py-3 text-[11px] tracking-[0.16em] wrap-anywhere" style={{ color: v.actionStatusColor }}>
          {v.actionStatus}{v.actionHash ? ' · ' : ''}{v.actionHash && v.actionExplorerUrl ? <a href={v.actionExplorerUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{v.actionHash}</a> : v.actionHash}
        </div>
      )}
      <PageTransition />
      <div className="[transition:opacity_170ms_linear]" style={{ opacity: v.pageOpacity }}>
        {v.isHome && <HomePage />}
        {v.isReplay && <ReplayPage />}
        {v.isBorrow && <BorrowPage />}
        {v.isBackup && <BuyersPage />}
        {v.isLend && <LendPage />}
        {v.isControl && <ControlPage />}
      </div>
      {v.notHome && <Footer />}
      {v.menuOpen && <MenuOverlay />}
    </div>
  );
}
