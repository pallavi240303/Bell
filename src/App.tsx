import {Header} from '@/components/layout/Header';
import {TooltipProvider} from '@/components/ui/tooltip';
import {AppEffects} from '@/components/layout/AppEffects';
import {PageTransition} from '@/components/layout/PageTransition';
import {Footer} from '@/components/layout/Footer';
import {MenuOverlay} from '@/components/layout/MenuOverlay';
import {HomePage} from '@/pages/HomePage';
import {ReplayPage} from '@/pages/ReplayPage';
import {BorrowPage} from '@/pages/BorrowPage';
import {BuyersPage} from '@/pages/BuyersPage';
import {LendPage} from '@/pages/LendPage';
import {ControlPage} from '@/pages/ControlPage';
import {WalletDialog,TransactionToast} from '@/components/ui/Controls';
import {useBell,useBellRuntime} from '@/state/useBell';
export default function App(){useBellRuntime();const v=useBell();return <TooltipProvider delayDuration={150}><div className="bell-app"><AppEffects/><Header/><PageTransition/><div style={{opacity:v.pageOpacity}}>{v.isHome&&<HomePage/>}{v.isReplay&&<ReplayPage/>}{v.isBorrow&&<BorrowPage/>}{v.isBackup&&<BuyersPage/>}{v.isLend&&<LendPage/>}{v.isControl&&<ControlPage/>}</div><Footer/>{v.menuOpen&&<MenuOverlay/>}<WalletDialog/><TransactionToast/></div></TooltipProvider>;}
