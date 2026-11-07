import {ArrowRight,ArrowUpRight,ShieldCheck,Coins,Clock3,Landmark,Layers3,Network,FileCheck2,Sunrise} from 'lucide-react';
import {useBell} from '@/state/useBell';
import {Button} from '@/components/ui/Controls';
import {Reveal} from '@/components/ui/Reveal';
import {TypeLine} from '@/components/ui/TypeLine';
import {Card} from '@/components/ui/card';
import {Accordion,AccordionItem,AccordionTrigger,AccordionContent} from '@/components/ui/accordion';

const flow=[
 ['01','Borrow against stock.','Deposit collateral and take an ordinary USDC loan. Cover is optional.'],
 ['02','Buyers commit cash.','Buyers choose a purchase price, premium and exposure, then escrow their USDC.'],
 ['03','Back the existing loan.','During the cover window, the borrower selects funded offers and pays the premium.'],
 ['04','Reopen. Verify. Settle.','Accepted market facts determine whether buyer cash repays debt and buyers receive stock claims.'],
];
const roles=[
 {Icon:Layers3,title:'Borrowers',lead:'Keep your exposure. Add a funded backup.',body:'Attach session cover to an eligible loan without borrowing again. Pay the agreed premium upfront.'},
 {Icon:Coins,title:'Buyers',lead:'Name your price. Back it with cash.',body:'Earn a premium when your offer is accepted. You commit to buy at that price; stock losses can exceed the fee.'},
 {Icon:Landmark,title:'Lenders',lead:'Supply USDC. Fund the lending pool.',body:'Covered loans have dedicated buyer commitments. Ordinary credit risk remains, and withdrawals depend on liquidity.'},
];
const outcomes=[
 {Icon:ShieldCheck,title:'The loan stays healthy',body:'Session cover ends and unused buyer commitments are released. The ordinary loan continues.'},
 {Icon:Sunrise,title:'The loan needs settlement',body:'Committed cash repays debt under the agreed terms. Buyers receive stock claims; any residual loan continues.'},
 {Icon:Clock3,title:'The deadline arrives',body:'If normal settlement has not completed, funded terminal settlement applies without a reopening price.'},
];

export function HomePage(){
 const v=useBell();
 return <main className="bell-home">
  <section className="home-hero">
   <div className="hero-copy"><span className="eyebrow"><span className="indigo-dot"/> Funded cover for tokenized-stock loans</span><h1>Backed before<br/>the <span>bell.</span></h1><p>Borrow against your stock. Secure a funded buyer commitment before the market closes.</p><div className="hero-actions"><Button onClick={v.goReplay}>Try the guided demo <ArrowRight size={17}/></Button><Button variant="secondary" onClick={v.goBorrow}>Borrow USDC <ArrowUpRight size={16}/></Button></div><span className="hero-caption"><TypeLine text="Built for Arc · Market orchestration with Chainlink CRE"/></span></div>
   <figure className="hero-art"><div className="hero-art-image"><img src="/images/bell-stock-shield.png" width="1536" height="1024" fetchPriority="high" alt="An indigo BELL shield backed by dollar-token reserves stands in front of stacked metallic stock tokens beneath a falling market chart."/><span className="hero-light" aria-hidden="true"/></div><figcaption><ShieldCheck size={16} aria-hidden="true"/><span>Buyer-funded cover for the market-close window.</span></figcaption></figure>
  </section>

  <section className="home-explainer home-problem" aria-labelledby="problem-heading"><Reveal><div><span className="eyebrow">The risk window</span><h2 id="problem-heading">Markets close.<br/>Loans stay open.</h2></div></Reveal><Reveal delay={60}><div className="home-section-copy"><p>When the underlying stock market closes, the next reliable price may be hours away. Token liquidity can thin while the loan remains outstanding.</p><p><strong>BELL commits the buyer’s cash before that uncertainty begins.</strong> The selected loan has a funded settlement commitment under agreed terms.</p><span className="home-detail"><Clock3 size={16} aria-hidden="true"/> Cover applies to one eligible loan and market session.</span></div></Reveal></section>

  <section className="home-explainer home-flow-section" aria-labelledby="flow-heading"><div className="home-section-heading"><span className="eyebrow">How BELL works</span><h2 id="flow-heading">One loan. Four clear steps.</h2></div><ol className="home-flow-steps">{flow.map(([n,title,body],i)=><li key={n}><Reveal delay={i*45}><span className="step-number">{n}</span><h3>{title}</h3><p>{body}</p></Reveal></li>)}</ol></section>

  <section className="home-explainer" aria-labelledby="roles-heading"><div className="home-section-heading"><span className="eyebrow">Choose your role</span><h2 id="roles-heading">Clear commitments on every side.</h2></div><div className="home-card-grid">{roles.map(({Icon,title,lead,body},i)=><Reveal key={title} delay={i*45}><Card className="home-info-card"><Icon size={22} aria-hidden="true"/><span className="eyebrow">{title}</span><h3>{lead}</h3><p>{body}</p></Card></Reveal>)}</div></section>

  <section className="home-explainer" aria-labelledby="infrastructure-heading"><div className="home-section-heading"><span className="eyebrow">From market facts to transactions</span><h2 id="infrastructure-heading">Verify the event.<br/>Enforce the agreement.</h2></div><div className="home-infrastructure"><Card className="home-info-card"><Network size={22} aria-hidden="true"/><h3>Chainlink CRE</h3><p>Checks external market schedules, prices and events against onchain state. Accepted reports inform the contracts.</p><span className="home-detail">Demo: CRE CLI simulation</span></Card><Card className="home-info-card"><FileCheck2 size={22} aria-hidden="true"/><h3>BELL contracts on Arc</h3><p>Hold buyer USDC, calculate settlement, repay debt and assign stock claims. Each transaction has a public receipt.</p><span className="home-detail">Demo: Arc Testnet · mock stock</span></Card></div></section>

  <section className="home-explainer" aria-labelledby="outcomes-heading"><div className="home-section-heading"><span className="eyebrow">At the other side of the close</span><h2 id="outcomes-heading">Follow the outcome. Follow the money.</h2></div><div className="home-card-grid home-outcomes">{outcomes.map(({Icon,title,body})=><article key={title}><Icon size={21} aria-hidden="true"/><h3>{title}</h3><p>{body}</p></article>)}</div><p className="home-risk">Cover is limited to its funded terms. It does not guarantee stock value, buyer profit or recovery for every lender.</p></section>

  <section className="home-bottom"><div><span className="eyebrow">See the mechanism in action</span><h2>From the first loan to the final receipt.</h2><p>Follow the borrower, buyers through offers, cover and settlement. Simulated market inputs. Wallet-signed testnet actions.</p></div><Button onClick={v.goReplay}>Open the walkthrough <ArrowRight size={16}/></Button></section>
  <section className="home-faq"><h2>A few important details.</h2><Accordion type="single" collapsible>{v.faqs.map((f:any)=><AccordionItem key={f.q} value={f.q}><AccordionTrigger>{f.q.toLowerCase().replace(/^./,(s:string)=>s.toUpperCase())}</AccordionTrigger><AccordionContent><p>{f.a}</p></AccordionContent></AccordionItem>)}</Accordion></section>
 </main>;
}
