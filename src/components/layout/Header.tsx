import {Menu,Wallet,ChevronDown} from 'lucide-react';
import {useBell} from '@/state/useBell';
import {shortAddress} from '@/state/presentation';
/** BELL's established logo and menu shell with one wallet connection control. */
export function Header(){
 const v=useBell();
 return <header className="bell-header"><div className="header-inner">
 <button className="brand" onClick={v.goHome} aria-label="BELL home"><span className="font-display">BELL</span><i/></button>
 <nav className="header-navigation" aria-label="Main navigation"><button onClick={v.goBorrow} aria-current={!v.isHome&&!v.isReplay&&!v.isControl?'page':undefined}>App</button><button onClick={v.goReplay} aria-current={v.isReplay?'page':undefined}>Guided demo</button><button onClick={v.goControl} aria-current={v.isControl?'page':undefined}>Activity</button></nav>
 <div className="header-actions"><button className="wallet-trigger" onClick={()=>void v.controller.walletEntry()}><Wallet size={15}/><span>{v.wallet.connected?shortAddress(v.account):'Connect wallet'}</span>{v.wallet.connected?<span className="connection-dot"/>:<ChevronDown size={13}/>}</button><button className="icon-button menu-trigger" onClick={v.openMenu} aria-label="Open menu" aria-expanded={v.menuAria==='true'}><Menu size={19}/></button></div>
 </div>{v.isHome&&<div className="reading-progress" style={{width:v.readPct}}/>}</header>;
}
