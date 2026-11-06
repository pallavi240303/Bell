import {closeSync, fsyncSync, openSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {createPublicClient, createWalletClient, defineChain, encodeDeployData, encodeFunctionData, http, keccak256, parseTransaction, recoverTransactionAddress, parseAbi, type TransactionSerialized, type Address, type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {artifact, contracts} from '../services/keeper/abi.ts';
import {validateDeployment, verifyDeployment} from '../services/keeper/config.ts';
import {assertSafe} from '../services/keeper/evidence.ts';
import {json, type Deployment} from '../services/keeper/types.ts';

export const ARC_TESTNET={chainId:5042002,rpc:'https://rpc.testnet.arc.io',explorer:'https://explorer.testnet.arc.io',cash:'0x3600000000000000000000000000000000000000' as Address,forwarder:'0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1' as Address};
const cashAbi=parseAbi(['function decimals() view returns(uint8)']);
export async function arcPreflight(client:any,owner:Address){
  if(await client.getChainId()!==ARC_TESTNET.chainId)throw Error('Arc Testnet chain ID mismatch');
  if(await client.readContract({address:ARC_TESTNET.cash,abi:cashAbi,functionName:'decimals'})!==6)throw Error('Canonical USDC decimals must be 6');
  for(const address of [ARC_TESTNET.cash,ARC_TESTNET.forwarder]){
    const code=await client.getCode({address});if(!code||code==='0x')throw Error('Required Arc token or simulation forwarder code missing');
  }
  const [balance,gasPrice,block]=await Promise.all([client.getBalance({address:owner}),client.getGasPrice(),client.getBlock()]);
  if(balance<10n**18n)throw Error('Fund the dedicated deployer with at least 1 Arc Testnet USDC for deployment gas');
  if(block.gasLimit<5_000_000n)throw Error('Arc block gas limit is below the tested operation bound');
  return {chainId:String(ARC_TESTNET.chainId),owner,nativeBalance:balance.toString(),gasPrice:gasPrice.toString(),blockGasLimit:block.gasLimit.toString(),cash:ARC_TESTNET.cash,forwarder:ARC_TESTNET.forwarder};
}
interface JournalStep {hash:Hex;rawTransaction:Hex;dataHash:Hex;to?:Address;status:'pending'|'confirmed';blockNumber?:string;contractAddress?:Address;codeHash?:Hex}
export interface DeploymentJournal {schemaVersion:1;chainId:string;owner:Address;forwarder:Address;cash:Address;steps:Record<string,JournalStep>}
interface Ports {client:any;prepare(to:Address|undefined,data:Hex):Promise<Hex>;broadcast(raw:Hex):Promise<Hex>;save(journal:DeploymentJournal):void}
export async function deployProtocol(journal:DeploymentJournal,ports:Ports):Promise<Deployment>{
  if(journal.schemaVersion!==1||String(await ports.client.getChainId())!==journal.chainId)throw Error('Deployment journal chain mismatch');
  const addresses:Record<string,Address>={cash:journal.cash.toLowerCase() as Address};
  const receipts:any[]=[];
  async function step(label:string,to:Address|undefined,data:Hex){
    let entry=journal.steps[label];
    if(entry&&(entry.dataHash!==keccak256(data)||entry.to?.toLowerCase()!==to?.toLowerCase()))throw Error('Deployment journal input changed');
    if(!entry){
      const rawTransaction=await ports.prepare(to,data);
      entry={hash:keccak256(rawTransaction),rawTransaction,dataHash:keccak256(data),...(to?{to}:{}),status:'pending'};
      journal.steps[label]=entry;
      // Persist the exact signed authorization before any RPC can accept it.
      ports.save(journal);
    }
    try{
      const signed=parseTransaction(entry.rawTransaction);
      const sender=await recoverTransactionAddress({serializedTransaction:entry.rawTransaction as TransactionSerialized});
      if(keccak256(entry.rawTransaction)!==entry.hash||String(signed.chainId)!==journal.chainId||signed.nonce===undefined||sender.toLowerCase()!==journal.owner.toLowerCase()||signed.to?.toLowerCase()!==to?.toLowerCase()||keccak256(signed.data??'0x')!==entry.dataHash||signed.value&&signed.value!==0n)throw Error();
    }catch{throw Error('Deployment journal signed transaction mismatch');}
    let receipt;
    try{receipt=await ports.client.getTransactionReceipt({hash:entry.hash});}
    catch(error){
      if((error as {name?:string}).name!=='TransactionReceiptNotFoundError')throw error;
      // A retry may only submit these identical signed bytes, never a fresh nonce.
      const hash=await ports.broadcast(entry.rawTransaction);
      if(hash!==entry.hash)throw Error('Deployment journal broadcast hash mismatch');
      receipt=await ports.client.waitForTransactionReceipt({hash:entry.hash});
    }
    if(receipt.status!=='success')throw Error(`Deployment step reverted: ${label}`);
    const tx=await ports.client.getTransaction({hash:entry.hash});
    const signedNonce=parseTransaction(entry.rawTransaction).nonce;
    if(tx.hash!==entry.hash||tx.nonce!==signedNonce||tx.from.toLowerCase()!==journal.owner.toLowerCase()||tx.to?.toLowerCase()!==to?.toLowerCase()||keccak256(tx.input)!==entry.dataHash)throw Error('Deployment journal transaction mismatch');
    if(to===undefined){
      if(!receipt.contractAddress)throw Error('Deployment receipt has no contract address');
      const address=receipt.contractAddress.toLowerCase() as Address;
      const code=await ports.client.getCode({address});if(!code||code==='0x')throw Error('Deployment code missing');
      const codeHash=keccak256(code);
      if(entry.codeHash&&entry.codeHash!==codeHash)throw Error('Deployment journal code changed');
      if(entry.contractAddress&&entry.contractAddress!==address)throw Error('Deployment journal address mismatch');
      entry.contractAddress=address;entry.codeHash=codeHash;
    }
    entry.status='confirmed';entry.blockNumber=receipt.blockNumber.toString();ports.save(journal);receipts.push(receipt);return entry;
  }
  async function deploy(name:string,args:unknown[]){
    const a=artifact(contracts[name]!);
    const entry=await step(`deploy-${name}`,undefined,encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args}));
    addresses[name]=entry.contractAddress!;
  }
  const owner=journal.owner;
  await deploy('stock',[owner]);await deploy('registry',[owner]);await deploy('oracle',[owner]);await deploy('eligibility',[]);
  await deploy('book',[addresses.cash,addresses.eligibility,owner]);await deploy('pool',[addresses.cash,owner]);await deploy('vault',[owner]);
  await deploy('loanManager',[addresses.registry,addresses.oracle,addresses.pool,addresses.vault,owner]);
  await deploy('manager',[addresses.registry,addresses.oracle,addresses.book,addresses.pool,addresses.vault,addresses.loanManager,1]);
  await deploy('receiver',[addresses.oracle,journal.forwarder]);
  for(const [name,method,args] of [['book','initialize',[addresses.manager,addresses.pool]],['pool','initialize',[addresses.loanManager]],['vault','initialize',[addresses.loanManager]],['oracle','bindReceiver',[addresses.receiver]],['loanManager','bindCoverManager',[addresses.manager]]] as const){
    await step(`wire-${name}`,addresses[name],encodeFunctionData({abi:artifact(contracts[name]!).abi,functionName:method,args}));
  }
  const codeHashes:Record<string,Hex>={};
  for(const [name,address]of Object.entries(addresses)){
    const code=await ports.client.getCode({address});if(!code||code==='0x')throw Error(`Deployment component has no code: ${name}`);codeHashes[name]=keccak256(code);
  }
  // Start indexing only once every component exists and all bindings are complete.
  // The original deployment blocks remain in the per-step public journal.
  const deployment={chainId:journal.chainId,deploymentBlock:receipts.at(-1)!.blockNumber.toString(),addresses,codeHashes} as Deployment;
  validateDeployment(deployment);await verifyDeployment(ports.client,deployment);return deployment;
}
function writePublic(path:string,value:unknown){
  assertSafe(value);mkdirSync(dirname(path),{recursive:true});const temporary=`${path}.pending`;
  writeFileSync(temporary,json(value)+'\n',{mode:0o600});const file=openSync(temporary,'r');try{fsyncSync(file);}finally{closeSync(file);}renameSync(temporary,path);const directory=openSync(dirname(path),'r');try{fsyncSync(directory);}finally{closeSync(directory);}
}
async function main(){
  const root=fileURLToPath(new URL('../',import.meta.url));
  const envPath=resolve(root,'.env');const env={...(existsSync(envPath)?parseEnv(readFileSync(envPath,'utf8')):{}),...process.env};
  const key=env.DEPLOYER_PRIVATE_KEY;
  if(!key||!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('Add a dedicated funded DEPLOYER_PRIVATE_KEY to the ignored root .env');
  const account=privateKeyToAccount(key as Hex);
  const rpc=env.ARC_RPC_URL||ARC_TESTNET.rpc;
  const chain=defineChain({id:ARC_TESTNET.chainId,name:'Arc Testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[rpc]}}});
  const client=createPublicClient({chain,transport:http(rpc,{retryCount:0}),pollingInterval:1000});
  const preflight=await arcPreflight(client,account.address);console.log(json({stage:'preflight',...preflight}));
  if(!process.argv.includes('--broadcast')){console.log('Preflight only. Add --broadcast to deploy the simulation-authority contracts.');return;}
  const path=resolve(root,'deployments/runs/arc-optional-cover-journal.json');
  const journal:DeploymentJournal=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{schemaVersion:1,chainId:String(ARC_TESTNET.chainId),owner:account.address,forwarder:ARC_TESTNET.forwarder,cash:ARC_TESTNET.cash,steps:{}};
  if(journal.owner.toLowerCase()!==account.address.toLowerCase()||journal.cash!==ARC_TESTNET.cash||journal.forwarder!==ARC_TESTNET.forwarder)throw Error('Deployment journal identity mismatch');
  const wallet=createWalletClient({account,chain,transport:http(rpc,{retryCount:0})});
  const deployment=await deployProtocol(journal,{client,save:j=>writePublic(path,j),prepare:async(to,data)=>{
    const gas=await client.estimateGas({account,to,data});
    const fees=await client.estimateFeesPerGas();
    const maxFeePerGas=fees.maxFeePerGas<20_000_000_000n?20_000_000_000n:fees.maxFeePerGas;
    const nonce=await client.getTransactionCount({address:account.address,blockTag:'pending'});
    return wallet.signTransaction(await wallet.prepareTransactionRequest({to,data,nonce,gas:gas+gas/5n,maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas}));
  },broadcast:raw=>client.sendRawTransaction({serializedTransaction:raw})});
  writePublic(resolve(root,'deployments/runs/arc-optional-cover.json'),deployment);
  console.log(json({stage:'deployed',authority:'CRE SIMULATION + MOCK FORWARDER',asset:'Mock Stock (mSTOCK), demo only',deployment,transactions:Object.entries(journal.steps).map(([step,value])=>({step,hash:value.hash,explorerUrl:`${ARC_TESTNET.explorer}/tx/${value.hash}`}))}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch((error)=>{const safe=['Add a dedicated funded DEPLOYER_PRIVATE_KEY to the ignored root .env','Fund the dedicated deployer with at least 1 Arc Testnet USDC for deployment gas'];console.error(safe.includes(error?.message)?error.message:'Arc deployment stopped. Check RPC access and the public deployment journal; resume submits only identical signed transactions.');process.exitCode=1;});
