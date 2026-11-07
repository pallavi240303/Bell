import {createPublicClient,custom,http,type Address} from 'viem';
import {Transport,type Frame,json,uint} from '../adapter/transport.ts';
import {Wallet,WalletAccountMismatchError,type Intent,type Manifest} from '../adapter/wallet.ts';
import {FALLBACK_ID,ProviderDiscovery,fallbackProvider} from '../adapter/providers.ts';
import {amount,receiptLabel,loanLabel,truthLabels} from './truth.ts';
import {borrowIntent,coverIntent,borrowRequest,offerTemplate,offerTarget,coverPreview,position,editOffer,hashBundle,offerTerms,marketContext} from '../adapter/actions.ts';
import {debtLimit,loanPrice,projectedDebt} from '../../engine/receipt.ts';
import {abis} from '../generated/abis.ts';
import {mulDivDown} from '../../engine/math.ts';
import {cashOwed} from '../../engine/settle.ts';
import {exactUnits,utcInput,utcSeconds,timestamp} from './workflow.ts';
import {claimPayment,repaidFromCover} from './evidence.ts';
const muted='#74717f',ink='#252331',safe='#168060';
const pages=['HOME','REPLAY','BORROW','BUYERS','LEND','CONTROL'];
const faq=[['DOES BELL REMOVE MARKET RISK?',"No. Borrowers still carry the stock’s price drop. Reserved buyer cash backs the covered loan."],['IS THE WHOLE LOAN REPAID AT SETTLEMENT?','Normal settlement ends session cover. Residual debt continues accruing; terminal settlement closes debt, with delivery tracked separately.'],["WHAT IF THE STOCK OPENS BELOW THE BUYERS’ PRICES?",'Reserved buyers remain bound to their immutable terms. A premium does not guarantee profit.'],['IS EVERY LOAN COVERED?','No. The pool holds ordinary and session-covered loans. Lenders bear ordinary credit risk; cover backs only its selected loan and session.']];
export class Controller{
  frame:Frame|undefined;manifest:Manifest|undefined;wallet:Wallet|undefined;rpc:any;transport=new Transport();discovery:ProviderDiscovery|undefined;expectedAccount='';providerId='';
  private withdrawalQuote:{key:string;assets?:bigint;error?:string}|undefined;
  private withdrawalTimer:ReturnType<typeof setTimeout>|undefined;
  connectionIssue:{actualAddress:string;expectedAddress:string}|undefined;
  borrowAmount='';collateralAmount='';offerExpiry='';selectedAssetId='';walletPanelOpen=false;loading=false;private borrowSource='';
  selectedLoanId='';selectedReceiptId='';offerLoanId='';offerBasisExplicit=false;termsManual=false;loanMethod='borrow';loanArgs='';quoteManual=false;quoteLocked=false;quoteSource='';page='HOME';menu=false;showLog=false;wide=true;hover='';faqOpen=-1;version=0;listeners=new Set<()=>void>();
  status='';hash='';pending=false;transactionPhase='';noticeTone='info';transactions:{hash:string;label:string;phase:string}[]=[];supIn='';wdIn='';fShares='';fPct='';fFee='';fMaxLtv:string|undefined=undefined;priceIn='';termsText='';quoteText='';selected:string[]=[];events:any[]=[];eventIndex=0;
  wipeState:'off'|'in'|'out'='off';loadOp=0;pageOpacity=1;readPct='0%';private request=0;private session=0;private timers:ReturnType<typeof setTimeout>[]=[];
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};getVersion=()=>this.version;
  emit=()=>{this.version++;this.listeners.forEach(f=>f());};
  private resize=()=>{this.wide=window.innerWidth>=1240;this.emit();};
  private scroll=()=>{this.readPct=`${Math.min(100,window.scrollY/Math.max(1,document.documentElement.scrollHeight-window.innerHeight)*100)}%`;this.emit();};
  private key=(event:KeyboardEvent)=>{if(event.key==='Escape'){this.menu=false;this.emit();}};
  start(){this.discovery=new ProviderDiscovery(window,()=>{if(this.providerId===FALLBACK_ID)this.chooseProvider('');else this.emit();});this.discovery.start();this.resize();window.addEventListener('resize',this.resize);window.addEventListener('scroll',this.scroll,{passive:true});window.addEventListener('keydown',this.key);void this.run(async()=>{this.manifest=await this.transport.manifest();this.rpc=this.httpRpc();await this.refresh();});}
  private httpRpc(){return createPublicClient({transport:http((import.meta as unknown as {env?:{VITE_RPC_URL?:string}}).env?.VITE_RPC_URL||'/rpc')});}
  stop(){clearTimeout(this.withdrawalTimer);this.discovery?.stop();this.discovery=undefined;this.request++;this.timers.forEach(clearTimeout);window.removeEventListener('resize',this.resize);window.removeEventListener('scroll',this.scroll);window.removeEventListener('keydown',this.key);this.wallet?.dispose();}
  go=(page:string)=>{this.menu=false;this.timers.forEach(clearTimeout);this.timers=[];if(page===this.page){this.emit();return;}if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){this.page=page;this.wipeState='off';this.loadOp=0;this.pageOpacity=1;window.scrollTo(0,0);this.emit();return;}this.wipeState='in';this.loadOp=1;this.pageOpacity=1;this.emit();this.timers.push(setTimeout(()=>{this.page=page;window.scrollTo(0,0);this.wipeState='out';this.loadOp=0;this.emit();this.timers.push(setTimeout(()=>{this.wipeState='off';this.emit();},480));},760));};
  async run(work:()=>Promise<unknown>){if(!this.pending)this.transactionPhase='';try{await work();}catch(error){if(!this.frame)this.loading=false;const message=error instanceof Error?error.message:'Request failed';this.noticeTone=this.transactionPhase==='confirmed'?'info':'error';this.status=this.transactionPhase==='confirmed'?`Transaction confirmed. Balances could not refresh. Refresh the state before continuing.`:message;this.emit();}}
  async switchNetwork(){if(!this.manifest)throw Error('Load the deployment before switching networks.');await this.chosenProvider().provider.request({method:'wallet_switchEthereumChain',params:[{chainId:`0x${BigInt(this.manifest.chainId).toString(16)}`}]});await this.connect();}
  dismissNotice(){this.status='';this.emit();}
  disconnect(){const wallet=this.wallet;this.wallet=undefined;wallet?.dispose();this.reset();this.rpc=this.httpRpc();this.noticeTone='info';this.status='Wallet disconnected';void this.run(()=>this.refresh());}
  /** Clears every wallet-bound input after a provider, actor, account or chain change. Nothing is carried over. */
  private reset=()=>{clearTimeout(this.withdrawalTimer);this.withdrawalQuote=undefined;this.transactions=[];this.connectionIssue=undefined;this.session++;this.borrowAmount='';this.collateralAmount='';this.offerExpiry='';this.borrowSource='';this.selectedAssetId='';this.frame=undefined;this.supIn='';this.wdIn='';this.fShares='';this.fPct='';this.fFee='';this.fMaxLtv=undefined;this.selected=[];this.selectedReceiptId='';this.selectedLoanId='';this.quoteText='';this.quoteSource='';this.quoteLocked=false;this.quoteManual=false;this.loanArgs='';this.termsText='';this.offerLoanId='';this.offerBasisExplicit=false;this.termsManual=false;this.events=[];this.hash='';this.request++;this.status='Wallet changed · reconnect required';this.emit();};
  private chosenProvider(){
    const found=this.discovery?.list()??[];
    if(this.providerId){const chosen=this.discovery?.get(this.providerId)??(!found.length&&this.providerId===FALLBACK_ID&&typeof window!=='undefined'?fallbackProvider(window):undefined);if(!chosen)throw Error('Selected wallet is no longer available · choose again');return chosen;}
    if(!found.length){const single=typeof window==='undefined'?undefined:fallbackProvider(window);if(single)return single;throw Error('Install or open a connected wallet');}
    throw Error('Choose your wallet (MetaMask or Rabby) in the wallet dialog before connecting');
  }
  chooseProvider(id:string){if(id===this.providerId)return;this.providerId=id;const wallet=this.wallet;this.wallet=undefined;wallet?.dispose();this.reset();}
  chooseAccount(address:string){const key=address.toLowerCase();if(key&& !/^0x[0-9a-f]{40}$/.test(key))throw Error('Invalid wallet address');if(key===this.expectedAccount)return;this.expectedAccount=key;const wallet=this.wallet;this.wallet=undefined;wallet?.dispose();this.reset();}
  async connect(){
    const chosen=this.chosenProvider(),startingSession=this.session;
    if(!this.manifest)this.manifest=await this.transport.manifest();
    if(startingSession!==this.session)throw Error('Wallet changed while connecting');
    const previous=this.wallet;this.wallet=undefined;previous?.dispose();this.reset();
    const session=this.session;this.providerId=chosen.id;this.rpc=createPublicClient({transport:custom(chosen.provider)});
    const wallet=new Wallet(chosen.provider,this.rpc,this.manifest!,()=>{if(this.wallet===wallet)this.reset();},(this.expectedAccount||undefined) as Address|undefined);this.wallet=wallet;
    try{
      await wallet.connect();
      if(this.wallet!==wallet||session!==this.session)throw Error('Wallet changed while connecting');
      this.status='';this.noticeTone='info';
      await this.refresh();
      if(this.wallet!==wallet||session!==this.session)throw Error('Wallet changed while connecting');
      this.walletPanelOpen=false;this.noticeTone='success';this.status='Wallet connected';this.emit();
    }catch(error){
      const current=this.wallet===wallet;
      if(current){this.wallet=undefined;wallet.dispose();this.reset();this.rpc=this.httpRpc();void this.refresh().catch(()=>{});}
      else wallet.dispose();
      if(current&&error instanceof WalletAccountMismatchError)this.connectionIssue={actualAddress:error.actualAddress,expectedAddress:error.expectedAddress};
      throw error;
    }
  }
  async refresh(minimum=0n){
    const request=++this.request,account=this.wallet?.account;this.loading=true;
    this.frame=undefined;this.events=[];this.eventIndex=0;this.emit();
    const frame=await this.transport.state(account);
    if(frame.block.number<minimum)throw Error('Snapshot has not reached receipt block; refresh required');
    if(!this.rpc||!this.manifest)throw Error('Manifest unavailable');
    const verifier=this.wallet??new Wallet({request:async()=>undefined},this.rpc,this.manifest);
    await verifier.verify(frame.block.number,frame.block.hash);
    const evidence=await this.transport.events(frame.block);
    if(evidence.block.number!==frame.block.number||evidence.block.hash!==frame.block.hash||evidence.block.timestamp!==frame.block.timestamp)throw Error('Evidence boundary does not match snapshot');
    const headers=new Map<string,any>();
    for(const event of evidence.events){
      if(event.blockNumber>frame.block.number||event.blockTimestamp>frame.block.timestamp)throw Error('Event outside snapshot boundary');
      const key=event.blockNumber.toString();
      if(!headers.has(key))headers.set(key,await this.rpc.getBlock({blockNumber:event.blockNumber}));
      const header=headers.get(key);
      if(header.hash!==event.blockHash||header.timestamp!==event.blockTimestamp)throw Error('Historical event provenance replaced');
    }
    await verifier.verify(frame.block.number,frame.block.hash);
    if(request!==this.request||account!==this.wallet?.account)throw Error('Newer refresh superseded this snapshot');
    this.frame=frame;this.events=evidence.events;this.loading=false;this.prefill();this.emit();if(this.wdIn)void this.previewWithdrawal();
  }
  private quoteIdentity(){const s=this.frame?.state,p=s?.loans?.[this.loanSelection()];if(!p)return '';const a=s?.assets?.[p.loan.assetId];return json({account:this.wallet?.account,loanId:this.loanSelection(),loan:p.loan,debt:p.debtRecord,shares:p.remainingShares,reference:a?.latestReference,check:a?.referenceCheck,session:a?.state.activeSessionId,nonce:s?.balances?.[this.wallet?.account??'']?.borrowerNonce,policy:s?.coverPolicy});}
  private loanSelection(){const own=Object.entries(this.frame?.state.loans??{}).filter(([,p]:any)=>p.loan.borrower===this.wallet?.account);return own.some(([id])=>id===this.selectedLoanId)?this.selectedLoanId:own.filter(([,p]:any)=>p.loan.status===1n).at(-1)?.[0]??own.at(-1)?.[0]??'';}
  private assetSelection():string|undefined{
    if(this.selectedAssetId&&this.frame?.state.assets?.[this.selectedAssetId])return this.selectedAssetId;
    const ids=Object.keys(this.frame?.state.assets??{});if(ids.length===1)return ids[0];
    try{return marketContext(this.frame!).assetId;}catch{return undefined;}
  }
  async walletEntry(){
    this.walletPanelOpen=true;
    this.emit();
  }
  prefill(){if(!this.frame||!this.wallet?.account||!this.manifest)return;
    if(this.quoteText&&this.quoteSource&&this.quoteSource!==this.quoteIdentity()){this.quoteText='';this.quoteLocked=false;this.quoteManual=false;this.quoteSource='';this.selected=[];this.status='Consent changed · review fresh loan/reference/nonce inputs';}
    const assetId=this.assetSelection();
    try{
      if(this.loanMethod==='borrow'){
        const request=borrowRequest(this.frame,this.wallet.account,{},assetId),source=json(request);
        if(!this.loanArgs||this.borrowSource!==source){let old:any;try{old=JSON.parse(this.loanArgs)?.[0];}catch{}const preserved=Object.fromEntries(['principal','collateralShares','recipient'].filter(k=>typeof old?.[k]==='string').map(k=>[k,old[k]]));this.loanArgs=json([{...request,...preserved}]);this.borrowSource=source;}
      }
    }catch{if(this.loanMethod==='borrow'){this.loanArgs='';this.borrowSource='';}}
    try{const target=offerTarget(this.frame,this.offerBasisExplicit?this.offerLoanId||undefined:undefined,assetId);this.offerLoanId=target.loanId;if(!this.termsText||!this.termsManual){const old=this.termsText?JSON.parse(this.termsText):{};this.termsText=json(offerTemplate(this.frame,this.manifest.chainId,this.manifest.addresses.manager!,this.wallet.account,old,this.offerLoanId,assetId));}}
    catch{if(!this.termsManual)this.termsText='';if(!this.offerBasisExplicit)this.offerLoanId='';}
  }
  previewCover(){if(this.quoteLocked)throw Error('Consent reviewed for approval · clear consent to review changed lots');if(!this.frame||!this.wallet?.account||!this.manifest)return;this.selectedReceiptId='';
    try{const old=this.quoteManual&&this.quoteText?JSON.parse(this.quoteText):{};const bounds=Object.fromEntries(['maxDebtAtAcceptance','maxDebtAtDeadline','expiry','totalPremium'].filter(k=>old[k]!==undefined).map(k=>[k,old[k]]));this.quoteText=json(coverPreview(this.frame,this.manifest.chainId,this.manifest.addresses.manager!,this.wallet.account,this.loanSelection(),this.selected,bounds));this.quoteSource=this.quoteIdentity();}catch(error){if(!this.quoteManual)this.quoteText='';this.status=error instanceof Error?error.message:'Review the selected lots and session window.';}this.emit();}
  private checkedCover(){if(!this.frame||!this.wallet?.account||!this.manifest)throw Error('Connect and refresh');const q=JSON.parse(this.quoteText),expected=coverPreview(this.frame,this.manifest.chainId,this.manifest.addresses.manager!,this.wallet.account,this.loanSelection(),this.selected);
    for(const k of ['borrower','recipient','loanId','principal','collateralShares','snapshotMultiplierNumerator','snapshotMultiplierDenominator','referencePrice','referenceReportHash','borrowerNonce','configHash','sessionId','policyHash','scheduledReportHash','corporateActionHash'])if(q[k]!==expected[k])throw Error('Stale or mismatched cover consent');
    if(this.quoteSource&&this.quoteSource!==this.quoteIdentity())throw Error('Consent changed · review again');const hashes=this.selected.map(id=>this.frame!.state.termsHashes[id]);return {q,hashes,hash:hashBundle(this.manifest.chainId,this.manifest.addresses.manager!,q,this.selected as any,hashes)};}
  async send(intent:Intent){if(!this.wallet?.account||!this.wallet.verified)throw Error('Connect and verify your wallet first');if(this.pending)throw Error('Transaction pending');
    const wallet=this.wallet,session=this.session,account=wallet.account;
    if('approval'in intent&&intent.approval==='premium'&&this.quoteText){this.checkedCover();this.quoteLocked=true;this.quoteSource=this.quoteIdentity();}
    this.pending=true;this.transactionPhase='preparing';this.noticeTone='info';this.status='Preparing your transaction';this.hash='';this.emit();try{const unsigned=await this.transport.prepare({...intent,chainId:this.manifest!.chainId,from:account});if(this.wallet!==wallet||session!==this.session||wallet.account!==account||!wallet.verified)throw Error('Wallet changed while preparing');const receipt=await wallet.send(intent,unsigned,b=>this.refresh(b),event=>{if(this.wallet!==wallet||session!==this.session)return;this.transactionPhase=event.phase;this.noticeTone=event.phase==='confirmed'?'success':'info';if(event.hash)this.hash=event.hash;this.status=event.phase==='signature'?'Confirm in your wallet':event.phase==='submitted'?'Transaction submitted':'Transaction confirmed · updating balances';if(event.hash){const label='approval' in intent?'Token approval':'settlement' in intent?'Cover settlement':({deposit:'Supply USDC',borrow:'Open loan',postOffer:'Fund offer',buyCover:'Buy cover',withdrawClaim:'Collect shares',redeem:'Withdraw supply',cancelOffer:'Cancel offer'} as Record<string,string>)[intent.method]??intent.method;const previous=this.transactions.find(t=>t.hash===event.hash);if(previous)previous.phase=event.phase;else this.transactions.unshift({hash:event.hash,label,phase:event.phase});this.transactions=this.transactions.slice(0,20);}this.emit();});if(this.wallet!==wallet||session!==this.session)throw Error('Wallet changed while pending');
      if('method'in intent&&intent.contract==='loanManager'&&intent.method==='borrow'){const event=this.events.find(e=>e.transactionHash===receipt.transactionHash&&e.decoded?.eventName==='LoanOpened'&&e.decoded.args.borrower?.toLowerCase()===this.wallet?.account);const id=event?.decoded.args.loanId?.toString();if(id&&this.frame?.state.loans?.[id]?.loan.borrower===this.wallet.account)this.selectedLoanId=id;this.loanArgs='';this.prefill();}
      if('method'in intent&&intent.contract==='manager'&&intent.method==='buyCover'){const match=Object.entries(this.frame?.state.receipts??{}).find(([,p]:any)=>p.receipt.loanId.toString()===intent.args[0]&&p.receipt.consent.borrower===this.wallet?.account&&p.receipt.quoteHash===intent.args[4]);if(match){this.selectedReceiptId=match[0];this.selectedLoanId=(match[1] as any).receipt.loanId.toString();}this.quoteText='';this.quoteLocked=false;this.quoteManual=false;this.selected=[];}
      if('method'in intent&&intent.contract==='pool'&&intent.method==='redeem'){this.wdIn='';this.withdrawalQuote=undefined;}
      this.hash=receipt.transactionHash;this.status='CONFIRMED · canonical snapshot refreshed';return receipt;}finally{this.pending=false;this.emit();if(this.wdIn)void this.previewWithdrawal();}}
  set(field:string,value:string){if(field==='termsText')this.termsManual=!!value;if(field==='offerLoanId'){this.offerBasisExplicit=!!value;this.termsManual=false;if(!value)this.termsText='';}if(field==='quoteText'){this.quoteManual=true;this.quoteLocked=false;this.quoteSource=this.quoteIdentity();}if(field==='loanMethod'){this.loanArgs='';this.borrowSource='';}if(field==='selectedAssetId'){this.quoteText='';this.quoteSource='';this.quoteLocked=false;this.selected=[];this.selectedLoanId='';this.selectedReceiptId='';this.loanArgs='';this.borrowSource='';this.termsText='';this.termsManual=false;this.offerLoanId='';this.offerBasisExplicit=false;this.fMaxLtv=undefined;this.borrowAmount='';this.collateralAmount='';}(this as any)[field]=value;if(field==='wdIn'){this.withdrawalQuote=undefined;clearTimeout(this.withdrawalTimer);this.withdrawalTimer=setTimeout(()=>void this.previewWithdrawal(),250);}this.prefill();this.emit();}
  private offerTerms(){const base=JSON.parse(this.termsText);if(this.offerExpiry)base.expiry=this.offerExpiry;if(this.fMaxLtv!==undefined){const ltv=exactUnits(this.fMaxLtv,2);if(ltv===0n||ltv>10000n)throw Error('Maximum borrower LTV must be above 0 and at most 100%');base.maxBorrowerLtvBps=ltv.toString();}return offerTerms(json(base),this.fShares,this.fPct,this.fFee);}
  async post(){const receipt=await this.send({contract:'book',method:'postOffer',args:[this.offerTerms()]});if(this.wallet?.account&&this.manifest&&this.frame){const next=JSON.parse(this.termsText);delete next.nonce;this.termsText=json(next);this.termsManual=false;this.prefill();}this.emit();return receipt;}
  async borrow(){const {q,hashes,hash}=this.checkedCover();return this.send(coverIntent(this.loanSelection(),q,this.selected,hashes,hash));}
  async loanAction(){
    const args=JSON.parse(this.loanArgs);
    if(this.loanMethod==='settle'||this.loanMethod==='terminalSettle'){
      if(!Array.isArray(args)||args.length!==1)throw Error('Exactly one explicit receipt ID required');
      const receiptId=uint(args[0]).toString();return this.send({settlement:this.loanMethod,receiptId});
    }
    return this.send({contract:'loanManager',method:this.loanMethod,args});
  }
  async edit(id:string){const offer=this.frame?.state.offers[id];if(!offer)throw Error('Offer unavailable');return editOffer(offer,id,this.offerTerms(),intent=>this.send(intent));}
  private formBorrow(){if(!this.frame||!this.wallet?.account)throw Error('Connect your wallet and refresh verified state.');return borrowRequest(this.frame,this.wallet.account,{principal:exactUnits(this.borrowAmount,6).toString(),collateralShares:exactUnits(this.collateralAmount,18).toString()},this.assetSelection());}
  async openOrdinaryLoan(){const intent=borrowIntent(this.formBorrow());const receipt=await this.send(intent);this.borrowAmount='';this.collateralAmount='';this.emit();return receipt;}
  async approveAction(purpose:'deposit'|'collateral'|'offer'|'premium'){
    const value=purpose==='deposit'?exactUnits(this.supIn,6):purpose==='collateral'?exactUnits(this.collateralAmount,18):purpose==='offer'?cashOwed(exactUnits(this.fShares,18),exactUnits(this.fPct,6)):uint(this.checkedCover().q.totalPremium);
    if(value===0n)throw Error('No positive approval is needed.');return this.send({approval:purpose,amount:value.toString()});
  }
  async settleSelected(terminal:boolean){const v=this.renderVals();if(!v.receiptId)throw Error('Select the active session receipt.');return this.send({settlement:terminal?'terminalSettle':'settle',receiptId:v.receiptId});}
  private withdrawalKey(){return `${this.session}:${this.frame?.block.hash}:${this.wallet?.account}:${this.wdIn}`;}
  private withdrawalReason(){
    if(!this.wallet?.verified||!this.wallet.account)return 'Connect your wallet to withdraw.';
    if(this.pending)return 'Wait for the pending wallet transaction.';
    if(!this.frame)return 'Load verified balances before withdrawing.';
    try{const shares=exactUnits(this.wdIn,18),owned=this.frame.state.balances?.[this.wallet.account]?.poolShares;
      if(owned===undefined)return 'Your pool share balance is unavailable.';
      if(shares>owned)return 'This amount exceeds your pool shares.';
    }catch(e){return (e as Error).message;}
    return '';
  }
  /** eth_call executes the deployed redeem logic without signing or moving funds. */
  async previewWithdrawal(){
    const key=this.withdrawalKey();if(this.withdrawalReason())return;
    this.withdrawalQuote={key};this.emit();
    try{
      const account=this.wallet!.account!,frame=this.frame!;
      const {result}=await this.rpc.simulateContract({address:this.manifest!.addresses.pool,abi:abis.pool,functionName:'redeem',args:[exactUnits(this.wdIn,18),account],account,blockNumber:frame.block.number});
      if(key!==this.withdrawalKey())return;
      if(typeof result!=='bigint'||result<=0n)throw Error('ZeroConversion');
      this.withdrawalQuote={key,assets:result};
    }catch(e){
      if(key!==this.withdrawalKey())return;
      const error=String(e);
      this.withdrawalQuote={key,error:/InsufficientLiquidity/.test(error)?'Not enough available pool liquidity. Reduce the shares or wait for repayments.':/ZeroConversion/.test(error)?'This amount is too small to redeem for USDC.':'Withdrawal preview failed. Refresh balances and try again.'};
    }
    this.emit();
  }
  private workflow(ready:boolean,p:any,cover:any,receiptId:string|undefined,balance:any){
    const state=this.frame?.state,account=this.wallet?.account,id=this.assetSelection(),a=id?state?.assets?.[id]:undefined,session=a?state?.sessions?.[a.state.activeSessionId]?.fact:undefined;
    const baseReason=this.pending?'Wait for the pending wallet transaction.':!account?'Connect your wallet to continue.':!this.frame?'Loading verified chain state. Refresh and wait for verification.':'';
    let m:any,marketReason='';try{m=marketContext(this.frame!,id);}catch(e){marketReason=e instanceof Error?e.message:'Fresh market data required.';}
    let borrowReason=baseReason,borrowValid=false,collateralValid=false,supplyValid=false,offerValid=false,premiumValid=false,supplyReason=baseReason,postReason=baseReason,canPost=false,canSupply=false,offerEscrow:bigint|undefined;
    let collateral:bigint|undefined,supply:bigint|undefined;
    try{collateral=exactUnits(this.collateralAmount,18);collateralValid=ready&&!!id&&a?.configs&&Object.values(a.configs).some((c:any)=>c.configHash===a.state.configHash&&c.config.assetToken===this.manifest?.addresses.stock);}catch{}
    try{supply=exactUnits(this.supIn,6);supplyValid=ready;}catch(e){if(!supplyReason)supplyReason=e instanceof Error?e.message:'Enter supply amount.';}
    try{offerEscrow=cashOwed(exactUnits(this.fShares,18),exactUnits(this.fPct,6));offerValid=ready&&offerEscrow>0n;}catch{}
    if(!borrowReason)try{
      if(!m)throw Error(marketReason);const request=this.formBorrow(),principal=uint(request.principal),shares=uint(request.collateralShares),token=state?.stockTokens?.[m.config.assetToken]?.balances?.[account!];
      if(token?.balance===undefined||token.balance<shares)throw Error('Insufficient collateral token balance.');
      if(token.allowanceVault===undefined||token.allowanceVault<shares)throw Error('Approve the entered collateral amount first.');
      const liquid=state?.balances?.[this.manifest!.addresses.pool!.toLowerCase()]?.cash;
      if(liquid===undefined||liquid<principal)throw Error('The lender must supply enough USDC liquidity first.');
      borrowValid=ready;borrowReason='Review principal, collateral and the accepted reference before signing.';
    }catch(e){borrowReason=e instanceof Error?e.message:'Review borrow inputs.';}
    if(!supplyReason&&supply!==undefined){if(balance?.cash===undefined||balance.cash<supply){supplyReason='Insufficient USDC balance; retain USDC for gas.';supplyValid=false;}else if(balance.cashAllowancePool===undefined||balance.cashAllowancePool<supply)supplyReason='Approve the supply USDC amount first.';else{canSupply=ready;supplyReason='Review your exact USDC deposit before signing.';}}
    if(!postReason)try{
      if(!m)throw Error(marketReason);const terms=this.offerTerms(),expiry=uint(terms.expiry,64);
      if(expiry<=this.frame!.block.timestamp||expiry<=m.session.scheduledClose)throw Error('Choose an offer expiry after the session close.');
      const capacity=cashOwed(uint(terms.snapshotShares),uint(terms.strike));
      if(balance?.cash===undefined||balance.cash<capacity)throw Error('Insufficient USDC for this offer; retain USDC for gas.');
      if(balance.cashAllowanceBook===undefined||balance.cashAllowanceBook<capacity)throw Error('Approve the offer cash amount first.');
      canPost=ready;postReason='Review the lot, premium and expiry before signing.';
    }catch(e){postReason=e instanceof Error?e.message:'Review offer inputs.';}
    try{premiumValid=ready&&uint(this.checkedCover().q.totalPremium)>0n;}catch{}
    const active=ready&&!!receiptId&&cover?.receipt.status===1n,deadline=cover?.receipt.settlementDeadline,now=this.frame?.block.timestamp;
    const canSettle=!!(active&&now!==undefined&&deadline!==undefined&&now<deadline&&cover.benchmark?.finalized),canTerminalSettle=!!(active&&now!==undefined&&deadline!==undefined&&now>=deadline);
    const run=(f:()=>Promise<unknown>)=>()=>void this.run(f);
    return {walletPanelOpen:this.walletPanelOpen,onWalletPanel:(open:boolean)=>{if(this.walletPanelOpen!==open){this.walletPanelOpen=open;this.emit();}},onRefresh:run(()=>this.refresh()),assetId:id??'',assetOptions:Object.entries(state?.assets??{}).map(([assetId,asset]:any)=>({id:assetId,label:`${state?.stockTokens?.[Object.values(asset.configs)[0]&&(Object.values(asset.configs)[0] as any).config.assetToken]?.symbol??'Stock'} · ${assetId.slice(0,10)}…`})),onAsset:(e:any)=>this.set('selectedAssetId',e.target.value),marketReady:!!m,marketReason,sessionClose:timestamp(session?.scheduledClose),coverWindow:session&&state?.coverPolicy?`${timestamp(BigInt(session.scheduledClose)-BigInt(state.coverPolicy.coverOpensBeforeClose))} — ${timestamp(BigInt(session.scheduledClose)-BigInt(state.coverPolicy.coverCutoffBeforeClose))}`:'Unavailable',referenceObserved:timestamp(a?.latestReference?.observedAt),borrowAmount:this.borrowAmount,collateralAmount:this.collateralAmount,onBorrowAmount:(e:any)=>this.set('borrowAmount',e.target.value),onCollateralAmount:(e:any)=>this.set('collateralAmount',e.target.value),canBorrow:borrowValid,borrowReason,onBorrow:run(()=>this.openOrdinaryLoan()),canApproveCollateral:collateralValid,onApproveCollateral:run(()=>this.approveAction('collateral')),canApproveSupply:supplyValid,onApproveSupply:run(()=>this.approveAction('deposit')),canApproveOffer:offerValid,onApproveOffer:run(()=>this.approveAction('offer')),canApprovePremium:premiumValid,onApprovePremium:run(()=>this.approveAction('premium')),offerExpiryInput:utcInput(this.offerExpiry||(()=>{try{return JSON.parse(this.termsText).expiry;}catch{return '';}})()),onOfferExpiry:(e:any)=>void this.run(async()=>this.set('offerExpiry',utcSeconds(e.target.value))),canSettle,canTerminalSettle,onSettle:run(()=>this.settleSelected(false)),onTerminalSettle:run(()=>this.settleSelected(true)),offerEscrowFmt:amount(offerEscrow,6),canPost,postReason,canSupply,supplyReason};
  }
  renderVals():any{
    const state=this.frame?.state,account=this.wallet?.account,balance=account?state?.balances?.[account]:undefined;
    const positions=Object.entries(state?.loans??{}).filter(([,p]:any)=>p.loan.borrower===account);const loanId=this.loanSelection(),position=state?.loans?.[loanId];
    const histories=Object.entries(state?.receipts??{}).filter(([,p]:any)=>p.receipt.loanId.toString()===loanId);const historyReceiptId=histories.some(([id])=>id===this.selectedReceiptId)?this.selectedReceiptId:position?.loan.activeCoverId?.toString()!=='0'?position?.loan.activeCoverId?.toString():histories.at(-1)?.[0];const showCoverPreview=!!this.quoteText&&this.selected.length>0&&!this.selectedReceiptId;const receiptId=showCoverPreview?undefined:historyReceiptId,cover=state?.receipts?.[receiptId];
    const coverStatus=position?.loan.activeCoverId!==undefined&&position.loan.activeCoverId!==0n?'COVER ACTIVE':histories.length?'COVER ENDED':'UNCOVERED';
    const labels=truthLabels(this.manifest?.chainId,!!this.frame,state?.receiverMode===1n?'SIMULATION RECEIVER · SUPPLIED REPORT INPUT':state?.receiverMode===0n?'AUTHENTICATED RECEIVER':'RECEIVER MODE UNVERIFIED');
    const ready=!!account&&!!this.wallet?.verified&&!!this.frame&&!this.pending;const reason=ready?'Review exact inputs before signing':'CONNECT WALLET · VERIFIED SNAPSHOT REQUIRED';
    const offers=Object.entries(state?.offers??{}).map(([id,o]:any)=>({id,...o,termsHash:state?.termsHashes?.[id],name:`${o.buyer.slice(0,6)}…${o.buyer.slice(-4)}`,shFmt:amount(o.terms.snapshotShares,18),pxFmt:amount(o.terms.strike,6),feeFmt:amount(o.terms.premium,6),escFmt:amount(state?.offerCoverage?.[id]?.currentLockedCash,6),capacityFmt:amount(o.cashCapacity,6),resFmt:o.receiptId.toString(),expFmt:o.terms.expiry.toString(),color:o.status===1n?safe:muted,status:({1:'FREE',2:'RESERVED',3:'RELEASED',4:'CANCELLED'} as Record<string,string>)[o.status.toString()]??'NONE',onCancel:()=>this.run(()=>this.send({contract:'book',method:'cancelOffer',args:[id]})),onEdit:()=>this.run(()=>this.edit(id)),own:o.buyer.toLowerCase()===account,select:()=>{if(this.quoteLocked){this.status='Consent reviewed · clear consent before changing lots';this.emit();return;}this.selected=this.selected.includes(id)?this.selected.filter(x=>x!==id):[...this.selected,id];this.previewCover();this.emit();},selected:this.selected.includes(id)}));
    const claims=Object.entries(state?.claims??{}).filter(([,c]:any)=>c.owner.toLowerCase()===account).map(([id,c]:any)=>{
      const token=state?.loans?.[c.receiptId.toString()]?.loan.config.assetToken??this.manifest?.addresses.stock,metadata=state?.stockTokens?.[token],paused=metadata?.paused===true||(token===this.manifest?.addresses.stock&&state?.tokens?.stock?.paused===true),restricted=metadata?.balances?.[account!]?.restricted===true;
      const immature=c.maturesAt!==undefined&&this.frame!.block.timestamp<c.maturesAt,canWithdraw=ready&&!c.withdrawn&&!paused&&!restricted&&!immature,payment=claimPayment(id,c,state,this.events,this.manifest?.addresses);
      const reason=c.withdrawn?'Contract delivery recorded':paused?'Token transfers are paused; the claim remains owed.':restricted?'Recipient transfer restriction must be resolved.':immature?'Claim has not matured yet.':!ready?'Connect the claim owner wallet and refresh.':'Claim owed · delivery pending';
      return {name:`Claim ${id}`,shFmt:amount(c.snapshotShares,18),paidFmt:amount(payment.paid,6),pxFmt:amount(payment.strike,6),worthFmt:amount(c.deliveryUnits,18),unitsLabel:c.withdrawn?'DELIVERED UNITS':'PENDING UNITS',canWithdraw,blocked:!canWithdraw,btnLabel:c.withdrawn?'DELIVERED':paused?'PAUSED':immature?'NOT MATURE':'WITHDRAWAL UNAVAILABLE',reason,reasonColor:muted,onWithdraw:()=>this.run(()=>this.send({contract:'vault',method:'withdrawClaim',args:[id,account]}))};
    });
    const observed=!position&&['HOME','REPLAY','CONTROL'].includes(this.page)?Object.values(state?.loans??{}).filter((p:any)=>p.loan.status===1n).at(-1) as any:undefined;
    const displayPosition=position??observed;
    let price:bigint|undefined,limit:bigint|undefined,priceSource='AUTHENTICATED REFERENCE';try{const m=marketContext(this.frame!,displayPosition?.loan.assetId??this.assetSelection());if(displayPosition){price=loanPrice({...displayPosition,debt:displayPosition.debtRecord},m.reference);limit=debtLimit(displayPosition.remainingShares,price,displayPosition.loan.config.originationLtvBps);} }catch{
      if(displayPosition){const asset=state?.assets?.[displayPosition.loan.assetId],active=state?.sessions?.[asset?.state.activeSessionId]?.benchmark,history=Object.values(state?.receipts??{}).filter((r:any)=>r.receipt.loanId.toString()===Object.entries(state?.loans??{}).find(([,p])=>p===displayPosition)?.[0]).map((r:any)=>r.benchmark);const candidates=[active,...history].filter(b=>b?.finalized&&b.assetId===displayPosition.loan.assetId&&b.price>0n&&b.multiplierNumerator>0n&&b.multiplierDenominator>0n&&b.reportHash&&b.reportHash!==`0x${'0'.repeat(64)}`);candidates.sort((a,b)=>a.observedAt>b.observedAt?-1:1);const b=candidates[0];if(b){try{price=loanPrice({...displayPosition,debt:displayPosition.debtRecord},b);priceSource='FINALIZED REOPEN BENCHMARK';}catch{}}}
    }
    // Display-only bps quotient uses full BigInt products; valid C0 observations may exceed uint256 intermediates.
    const ratio=displayPosition&&price!==undefined&&price>0n&&displayPosition.remainingShares>0n?displayPosition.debt*10n**22n/(displayPosition.remainingShares*price):undefined;
    let buyOk=false,buyReason=reason;try{if(ready){if(!position)throw Error('Borrow an ordinary loan first.');if(!this.quoteText)throw Error(this.selected.length?'Review the selected lots and the active cover window.':'Select one to eight FREE buyer lots below.');const checked=this.checkedCover(),premium=uint(checked.q.totalPremium);if(premium>0n&&(balance?.cash===undefined||balance.cash<premium))throw Error('Insufficient USDC for the cover premium.');if(premium>0n&&(balance?.cashAllowanceBook===undefined||balance.cashAllowanceBook<premium))throw Error('Approve the cover premium first.');buyOk=true;}}catch(e){buyReason=e instanceof Error?e.message:'Review exact consent';}
    let preview:any,previewCeiling:bigint|undefined,previewShares:bigint|undefined,previewReference:bigint|undefined,previewCoverage:bigint|undefined,previewDeadline:bigint|undefined,previewPremium:bigint|undefined;
    try{if(this.quoteText){preview=JSON.parse(this.quoteText);previewPremium=uint(preview.totalPremium);previewShares=uint(preview.totalOfferShares);previewReference=uint(preview.referencePrice);previewDeadline=uint(preview.minSettlementDeadline,64);if(position)previewCeiling=projectedDebt({ ...position,debt:position.debtRecord },previewDeadline,this.frame!.block.timestamp);previewCoverage=this.selected.reduce((sum,id)=>sum+(state?.offerCoverage?.[id]?.currentLockedCash??0n),0n);}}catch{/* Malformed raw consent remains unready and has no invented financial preview. */}
    const offerLoans=Object.entries(state?.loans??{}).filter(([,p]:any)=>p.loan.status===1n);const offerTargetPosition=state?.loans?.[this.offerLoanId];
    const contextPosition=this.page==='CONTROL'?undefined:position??offerTargetPosition;
    const referenceAssetId=contextPosition?.loan.assetId??this.assetSelection(),referenceAsset=referenceAssetId?state?.assets?.[referenceAssetId]:undefined;
    const selectedConfig=Object.values(referenceAsset?.configs??{}).find((entry:any)=>entry.configHash===referenceAsset?.state.configHash) as any;
    const selectedTokenId=contextPosition?.loan.config.assetToken??(this.page==='CONTROL'?selectedConfig?.config.assetToken:this.manifest?.addresses?.stock);
    const selectedStock=selectedTokenId?state?.stockTokens?.[selectedTokenId]??(selectedTokenId===this.manifest?.addresses?.stock?state?.tokens?.stock:undefined):this.page==='CONTROL'?undefined:state?.tokens?.stock;
    const controlReference=referenceAsset?.latestReference;const controlReferenceFmt=controlReference?.reportHash&&controlReference.reportHash!==`0x${'0'.repeat(64)}`?amount(controlReference.price,6):'—';
    const card={badge:loanLabel(displayPosition?.loan.status),badgeColor:muted,badgeEl:null,flashEl:null,shFmt:amount(displayPosition?.remainingShares,18),debtFmt:amount(displayPosition?.debt,6),pxFmt:amount(price,6),pxSrc:priceSource,limitFmt:amount(limit,6),ratioFmt:ratio===undefined?'—':`${amount(ratio,2)}%`,ratioColor:muted,barW:ratio===undefined?'0%':`${Number(ratio>10000n?10000n:ratio)/100}%`,barColor:muted,valFmt:price!==undefined&&displayPosition?amount(mulDivDown(displayPosition.remainingShares,price,10n**18n),6):'—',lockFmt:amount(displayPosition?.currentCoverage,6),lockW:displayPosition?.debt>0n?`${Number((displayPosition.currentCoverage*10000n/displayPosition.debt)>10000n?10000n:(displayPosition.currentCoverage*10000n/displayPosition.debt))/100}%`:'0%',lockColor:safe,shChip:'',pxChip:'',debtChip:'',lockChip:'',flow:false,notFlow:true,flowText:'',shield:false,note:observed?`Public observed loan for ${observed.loan.borrower}. Connect the owner wallet to act.`:position?`${coverStatus}. Debt continues on the original loan; claim delivery is separate.`:'No connected-wallet loan in this snapshot.',noteColor:muted};
    const activeLoans=(state?.pool?.activeLoanIds??[]).map((id:bigint)=>state?.loans?.[id.toString()]).filter(Boolean);const poolDebt=activeLoans.reduce((sum:bigint,p:any)=>sum+p.debt,0n),coveredDebt=activeLoans.filter((p:any)=>p.loan.activeCoverId!==0n).reduce((sum:bigint,p:any)=>sum+p.debt,0n),coveredBps=poolDebt?mulDivDown(coveredDebt,10000n,poolDebt):0n;
    const repaid=repaidFromCover(this.events,this.manifest?.addresses?.manager);
    const nav=(p:string)=>()=>this.go(p);const change=(field:string)=>(event:any)=>this.set(field,event.target.value);const run=(f:()=>Promise<unknown>)=>()=>void this.run(f);
    const workflow=this.workflow(ready,position,cover,receiptId,balance);
    const announced=this.discovery?.list()??[],single=announced.length||typeof window==='undefined'?undefined:fallbackProvider(window);
    const providerOptions=[...announced,...(single?[single]:[])].map(p=>({id:p.id,label:p.rdns&&p.rdns!==p.name?`${p.name} · ${p.rdns}`:p.name}));
    const wallet={session:this.session,providerOptions,providerId:this.providerId||(announced.length===0&&single?single.id:''),chainId:this.wallet?.chainId?.toString(),expectedChainId:this.manifest?.chainId,expectedAddress:this.expectedAccount||undefined,connected:!!this.wallet?.verified};
    const withdrawal=this.withdrawalQuote?.key===this.withdrawalKey()?this.withdrawalQuote:undefined;
    const wdReason=this.withdrawalReason()||withdrawal?.error||(!withdrawal?.assets?'Checking withdrawal with the pool contract…':'');
    const canWd=ready&&!wdReason;
    return {controller:this,workflow,wallet,controlReferenceFmt,stockSymbol:selectedStock?.symbol||'shares',frame:this.frame,account,labels,ready,loanId,receiptId,position,coverStatus,showCoverPreview,coverOptions:histories.map(([id,r]:any)=>({id,label:`RECEIPT ${id} · ${receiptLabel(r.receipt.status)}`})),onCover:(e:any)=>{if((e.target.value===''&&this.quoteText&&this.selected.length)||histories.some(([id])=>id===e.target.value)){this.selectedReceiptId=e.target.value;this.emit();}},loanArgs:this.loanArgs,loanMethod:this.loanMethod,receiptOptions:positions.map(([id,p]:any)=>({id,label:`LOAN ${id} · ${loanLabel(p.loan.status)}`})),onReceipt:(event:any)=>{if(positions.some(([id])=>id===event.target.value)){this.selectedLoanId=event.target.value;this.selectedReceiptId='';this.quoteLocked=false;this.quoteManual=false;this.previewCover();this.emit();}},termsText:this.termsText,quoteText:this.quoteText,selected:this.selected,offerLoanId:this.offerLoanId,offerLoanOptions:[{id:'current',label:'CURRENT SHARE BASIS'},...offerLoans.map(([id]:any)=>({id,label:`BASIS OF LOAN ${id}`}))],onOfferLoan:(e:any)=>this.set('offerLoanId',e.target.value),
      isHome:this.page==='HOME',isReplay:this.page==='REPLAY',isBorrow:this.page==='BORROW',isBackup:this.page==='BUYERS',isLend:this.page==='LEND',isControl:this.page==='CONTROL',notHome:this.page!=='HOME',pageOpacity:this.pageOpacity,wipeState:this.wipeState,loadOp:this.loadOp,loadT:this.wipeState==='in'?'opacity 140ms ease 280ms':'opacity 100ms ease',wide:this.wide,readPct:this.readPct,
      goHome:nav('HOME'),goReplay:nav('REPLAY'),goBorrow:nav('BORROW'),goBackup:nav('BUYERS'),goLend:nav('LEND'),goControl:nav('CONTROL'),menuOpen:this.menu,menuAria:String(this.menu),openMenu:()=>{this.menu=true;this.emit();},closeMenu:()=>{this.menu=false;this.emit();},menuLeave:()=>{this.hover='';this.emit();},menuItems:pages.map((label,i)=>({label,num:String(i+1).padStart(2,'0'),go:nav(label),enter:()=>{this.hover=label;this.emit();},scale:!this.hover?1:this.hover===label?1.6:(pages.length-1.6)/(pages.length-1),ls:this.hover===label?'0.16em':'0.04em',op:!this.hover||this.hover===label?1:.55,aria:this.page===label?'page':'false',mark:this.page===label?'● CURRENT':'',delay:120+i*90})),
      statusColor:this.frame?safe:muted,statusWord:labels.network,cdLabel:'BLOCK',cdTime:this.frame?.block.number.toString()??'—',liveFg:ink,liveBg:'transparent',liveDot:account?safe:muted,liveAria:String(!!account),setLive:run(()=>this.walletEntry()),replayFg:muted,replayBg:'transparent',replayAria:'false',setReplay:nav('REPLAY'),scenario:'evidence',onScenario:()=>{},
      pending:this.pending,loading:this.loading,transactionPhase:this.transactionPhase,noticeTone:this.noticeTone,transactions:this.transactions,actionStatus:this.status,actionStatusColor:muted,actionHash:this.hash,actionExplorerUrl:this.hash&&this.manifest?.chainId==='5042002'?`https://explorer.testnet.arc.io/tx/${this.hash}`:'',
      homeLoanText:'Contract receipts and accepted reports determine the outcome.',pBellDebt:card.debtFmt,pBellSh:card.shFmt,pBellStake:'—',pBellW:'0%',pStdDebt:'—',pStdSh:'—',pStdStake:'—',pStdBonus:'—',pStdW:'0%',pResult:'NO COMPARISON WITHOUT CONFIRMED EVIDENCE',pResultC:muted,
      faqs:faq.map(([q,a],i)=>({q,a,fg:ink,toggle:()=>{this.faqOpen=this.faqOpen===i?-1:i;this.emit();},aria:String(this.faqOpen===i),id:`faq-${i}`,rot:this.faqOpen===i?'0deg':'90deg',rows:this.faqOpen===i?'1fr':'0fr',hidden:String(this.faqOpen!==i),op:this.faqOpen===i?1:0,ty:'0px',blur:'0px',delay:'0ms'})),
      bell:card,base:{...card,badge:'NO BASELINE',pxSrc:'NO BASELINE CONTRACT CONNECTED',shFmt:'—',debtFmt:'—',pxFmt:'—',ratioFmt:'—',barW:'0%',limitFmt:'—',lockFmt:'—',lockW:'0%',valFmt:'—',note:'No baseline contract is connected to this deployment.'},quote:offers.map(o=>({...o,fg:ink,netFmt:'—',cashFmt:o.escFmt})),breakdownLabel:cover?'COVER BREAKDOWN':'COVER PREVIEW · UNCONFIRMED',needLabel:cover?'RECEIPT CASH LOCKED':'SELECTED LOT CASH',quoteDebtLabel:cover?'DEBT AT ACCEPTANCE':'CURRENT LOAN DEBT',qShares:amount(cover?.receipt.consent.totalOfferShares??previewShares,18),refCloseFmt:amount(cover?.receipt.consent.referencePrice??previewReference,6),quoteDebtFmt:amount(cover?.receipt.debtAtAcceptance??position?.debt,6),quoteInterestFmt:amount(cover?.receipt.debtCeiling??previewCeiling,6),quoteReserveFmt:cover?.receipt.settlementDeadline?.toString()??previewDeadline?.toString()??'—',needFmt:amount(cover?.receiptRemainingCoverage??previewCoverage,6),feesFmt:amount(balance?.premiumCredit,6),quotePremiumFmt:amount(cover?.receipt.consent.totalPremium??previewPremium,6),buyOk,buyNo:!buyOk,buyReason,buyReasonColor:muted,onBuy:run(()=>this.borrow()),
      offers,hasOffers:offers.length>0,noOffers:offers.length===0,claims,noClaims:claims.length===0,fShares:this.fShares,fPct:this.fPct,fFee:this.fFee,fMaxLtv:this.fMaxLtv??(()=>{try{return amount(BigInt(JSON.parse(this.termsText).maxBorrowerLtvBps),2);}catch{return '';}})(),onFMaxLtv:change('fMaxLtv'),fEscrowFmt:workflow.offerEscrowFmt,fFeesFmt:this.fFee||'—',fPxFmt:this.fPct||'—',floorFmt:'PER OFFER TERMS',onFShares:change('fShares'),onFPct:change('fPct'),onFFee:change('fFee'),postOk:workflow.canPost,postNo:!workflow.canPost,postReason:workflow.postReason,postReasonColor:muted,onPost:run(()=>this.post()),
      supIn:this.supIn,wdIn:this.wdIn,onSupIn:change('supIn'),onWdIn:change('wdIn'),canSupply:workflow.canSupply,cantSupply:!workflow.canSupply,canWd,cantWd:!canWd,supplyReason:workflow.supplyReason,wdReason,onSupply:run(()=>this.send({contract:'pool',method:'deposit',args:[exactUnits(this.supIn,6).toString()]})),onWd:run(async()=>{if(!this.renderVals().canWd)throw Error('Review a fresh withdrawal preview first.');return this.send({contract:'pool',method:'redeem',args:[exactUnits(this.wdIn,18).toString(),account]});}),lend:{withdrawFmt:amount(!this.withdrawalReason()?withdrawal?.assets:undefined,6),walletFmt:amount(balance?.cash,6),balFmt:amount(balance?.poolShares,18),rateFmt:amount(state?.pool.totalAssets,6),utilFmt:amount(state?.balances?.[this.manifest?.addresses.pool?.toLowerCase()??'']?.cash,6),covPct:`${amount(coveredBps,2)}%`,stdPct:`${amount(10000n-coveredBps,2)}%`,debtFmt:amount(poolDebt,6),covW:`${Number(coveredBps)/100}%`,hasRecv:repaid>0n,recvFmt:amount(repaid,6)},
      evNum:this.events.length?String(this.eventIndex+1):'—',evTitle:this.events[this.eventIndex]?.decoded?.eventName??'No report evidence loaded',evBody:'Accepted logs are evidence. Contract state remains authoritative.',evClock:this.events[this.eventIndex]?.blockTimestamp.toString()??'—',evColor:muted,scLabel:'ACCEPTED EVIDENCE',scDates:'ONCHAIN EVENTS',onPrev:()=>{this.eventIndex=Math.max(0,this.eventIndex-1);this.emit();},onAdvance:run(()=>this.refresh()),onNext:()=>{this.eventIndex=Math.min(this.events.length-1,this.eventIndex+1);this.emit();},onPlay:run(()=>this.refresh()),onReset:run(()=>this.refresh()),canNext:this.eventIndex<this.events.length-1,cantNext:!(this.eventIndex<this.events.length-1),nextReason:'No later indexed evidence',canPlay:!this.pending,playLabel:'REFRESH',playIcon:'refresh-cw',playAria:'false',replayControlsEnabled:this.events.length>0,nowPct:'0%',chapters:['SCHEDULE','CLOSE','BENCHMARK','RECEIPTS'].map((label,i)=>({label,num:String(i+1).padStart(2,'0'),fg:muted,aria:'false',fill:'0%',go:()=>{const index=this.events.findIndex(e=>i===3?['LoanOpened','CoverPurchased','CoverEnded'].includes(e.decoded?.eventName):e.decoded?.eventName==='MarketEventAccepted'&&String(e.decoded.args.kind)===String(i+1));if(index>=0){this.eventIndex=index;this.emit();}}})),segs:[],progress:[],outcome:{show:false,bell:'—',base:'—',diff:'—',color:muted},hasRej:false,lowballLabel:'',tk1:muted,tk2:muted,tk3:muted,tk4:muted,showLog:this.showLog,toggleLog:()=>{this.showLog=!this.showLog;this.emit();},log:this.events.map((e,i)=>({t:`${e.blockNumber} · ${e.blockTimestamp}`,x:e.decoded?.eventName??'Contract log',color:muted})),logCount:this.events.length,logAria:'true',logArrow:'↑',logIcon:'list',oracleKnob:'0%',liveOAria:'false',frozenAria:'false',liveOFg:muted,frozenFg:muted,setFrozen:()=>{},setLiveOracle:()=>{},monPctFmt:'—',monPctV:'',onMonPct:()=>{},monPxFmt:'—',
      statusOpts:[this.frame?'ONCHAIN':'UNAVAILABLE','BLOCK TIME','WALLET'].map(label=>({label,fg:muted,bg:'transparent',aria:'false',go:run(()=>this.refresh())})),priceIn:this.priceIn,onPriceIn:change('priceIn'),onSetPrice:run(()=>this.refresh()),onClearPrice:run(()=>this.refresh()),tokenColor:muted,tokenState:selectedStock?.paused===undefined?'UNAVAILABLE':selectedStock.paused?'PAUSED · DELIVERY BLOCKED':'TRANSFERS ENABLED',pauseLabel:'REFRESH STATE',onTogglePause:run(()=>this.refresh()),rawFrame:this.frame?json(this.frame):'No snapshot',
    };
  }
}
export const bell=new Controller();
