import assert from 'node:assert/strict';
import test from 'node:test';
import {createWalletClient, http, encodeDeployData, encodeFunctionData, keccak256, type TransactionSerializable, type Address, type Hex} from 'viem';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {localNode} from '../../scripts/keeper-local.ts';
import {artifact, contracts} from '../../services/keeper/abi.ts';
import {validateDeployment} from '../../services/keeper/config.ts';
import {snapshot} from '../../services/keeper/state.ts';
import {arcPreflight, deployProtocol, ARC_TESTNET, type DeploymentJournal} from '../../scripts/arc-deploy.ts';

test('Arc preflight rejects the wrong chain, absent forwarder, wrong decimals, and unfunded wallet', async () => {
  const owner='0x0000000000000000000000000000000000000001' as Address;
  const state={chainId:5042002,decimals:6,gas:20_000_000_000n,balance:2n*10n**18n,code:'0x01'};
  const client={getChainId:async()=>state.chainId,getCode:async()=>state.code,readContract:async()=>state.decimals,getGasPrice:async()=>state.gas,getBalance:async()=>state.balance,getBlock:async()=>({gasLimit:30_000_000n})};
  assert.equal((await arcPreflight(client,owner)).chainId,'5042002');
  for(const [key,value,message] of [['chainId',1,/chain/i],['decimals',18,/decimals/i],['balance',0n,/fund/i],['code','0x',/code/i]] as const){
    const previous=state[key];(state as any)[key]=value;await assert.rejects(arcPreflight(client,owner),message);(state as any)[key]=previous;
  }
});

test('deployment wires actual contracts, uses supplied USDC, and resumes without duplicate transactions', async () => {
  const node=await localNode();
  try {
    const account=privateKeyToAccount(generatePrivateKey());
    await node.request('anvil_setBalance',[account.address,'0x3635c9adc5dea00000']);
    const owner=account.address.toLowerCase() as Address;const wallet=createWalletClient({account,transport:http(node.client.transport.url,{retryCount:0})});
    const cashArtifact=artifact('MockCashToken');
    const cashReceipt=await node.send(node.actors[0]!,undefined,encodeDeployData({abi:cashArtifact.abi,bytecode:cashArtifact.bytecode.object}));
    const cash=cashReceipt.contractAddress!;
    const journal:DeploymentJournal={schemaVersion:1,chainId:'31337',owner,forwarder:owner,cash,steps:{}};
    let sends=0,saves=0;
    const ports={client:node.client,prepare:async(to:Address|undefined,data:Hex)=>account.signTransaction(await wallet.prepareTransactionRequest({chain:null,chainId:31337,to,data,nonce:await node.client.getTransactionCount({address:owner,blockTag:'pending'})}) as TransactionSerializable),broadcast:async(raw:Hex)=>{sends++;return node.client.sendRawTransaction({serializedTransaction:raw});},save:()=>{saves++;}};
    const deployed=await deployProtocol(journal,ports);
    validateDeployment(deployed);
    const ready=await node.client.getBlock({blockNumber:BigInt(deployed.deploymentBlock)});
    const initial=await snapshot(node.client,deployed,[owner],[],ready);
    assert.equal(initial.state.nextReceiptId,1n,'manifest block supports a complete coherent snapshot');
    assert.equal(deployed.deploymentBlock,journal.steps['wire-loanManager']!.blockNumber,'manifest starts after every deployment and binding');
    assert.ok(BigInt(journal.steps['deploy-stock']!.blockNumber!)<BigInt(deployed.deploymentBlock),'original first block remains in the journal');
    assert.equal(deployed.addresses.cash,cash.toLowerCase());
    assert.equal(sends,15);assert.ok(saves>=30);
    const read=(name:string,method:string)=>node.client.readContract({address:deployed.addresses[name]!,abi:artifact(contracts[name]!).abi,functionName:method}) as Promise<any>;
    assert.equal((await read('oracle','receiver')).toLowerCase(),deployed.addresses.receiver);
    assert.equal((await read('receiver','forwarder')).toLowerCase(),owner);
    assert.equal((await read('book','coverManager')).toLowerCase(),deployed.addresses.manager);
    for(const name of ['pool','vault'])assert.equal((await read(name,'coverManager')).toLowerCase(),deployed.addresses.loanManager);
    assert.equal((await read('manager','loanManager')).toLowerCase(),deployed.addresses.loanManager);assert.equal((await read('loanManager','coverManager')).toLowerCase(),deployed.addresses.manager);assert.equal(await read('manager','profile'),1);
    assert.deepEqual(await deployProtocol(journal,ports),deployed);
    assert.equal(sends,15,'confirmed deployments/wiring are not sent twice');
    const changed=structuredClone(journal);changed.steps['deploy-stock']!.dataHash=`0x${'1'.repeat(64)}`;
    await assert.rejects(deployProtocol(changed,ports),/journal|changed/i);
    assert.equal(sends,15);
    await node.time((await node.client.getBlock()).timestamp+1n);
    await assert.rejects(node.send(node.actors[0]!,deployed.addresses.oracle,encodeFunctionData({abi:artifact('SessionOracle').abi,functionName:'bindReceiver',args:[owner]})),/reverted/i);
  } finally {await node.stop();}
});

test('Arc public constants use canonical USDC and separate simulation-forwarder authority',()=>{
  assert.equal(ARC_TESTNET.chainId,5042002);
  assert.equal(ARC_TESTNET.cash,'0x3600000000000000000000000000000000000000');
  assert.notEqual(ARC_TESTNET.forwarder,ARC_TESTNET.cash);
});

for(const failure of ['accepted-timeout','before-broadcast'] as const)test(`deployment recovers ${failure} using persisted signed bytes`,async()=>{
 const node=await localNode();try{
 const account=privateKeyToAccount(generatePrivateKey());await node.request('anvil_setBalance',[account.address,'0x3635c9adc5dea00000']);
 const wallet=createWalletClient({account,transport:http(node.client.transport.url,{retryCount:0})});
 const a=artifact('MockCashToken');const cash=(await node.send(node.actors[0]!,undefined,encodeDeployData({abi:a.abi,bytecode:a.bytecode.object}))).contractAddress!;
 let durable:DeploymentJournal={schemaVersion:1,chainId:'31337',owner:account.address,forwarder:node.actors[0]!,cash,steps:{}};let fail=true;const signed:Hex[]=[];
 const ports={client:node.client,save:(j:DeploymentJournal)=>{durable=structuredClone(j);if(fail&&failure==='before-broadcast'){fail=false;throw Error('crash');}},
 prepare:async(to:Address|undefined,data:Hex)=>{const nonce=await node.client.getTransactionCount({address:account.address,blockTag:'pending'});return account.signTransaction(await wallet.prepareTransactionRequest({chain:null,chainId:31337,to,data,nonce}) as TransactionSerializable);},
 broadcast:async(raw:Hex)=>{signed.push(raw);const hash=await node.client.sendRawTransaction({serializedTransaction:raw});if(fail){fail=false;throw Error('accepted timeout');}return hash;}};
 await assert.rejects(deployProtocol(structuredClone(durable),ports));const first=durable.steps['deploy-stock']!;
 assert.ok(first?.rawTransaction,'signed bytes durable before broadcast');assert.equal(first.hash,keccak256(first.rawTransaction));
 validateDeployment(await deployProtocol(structuredClone(durable),ports));
 assert.equal(await node.client.getTransactionCount({address:account.address}),15);assert.equal(new Set(signed).size,15);assert.equal(signed[0],first.rawTransaction);
 const tampered=structuredClone(durable);tampered.steps['deploy-stock']!.rawTransaction='0x01';await assert.rejects(deployProtocol(tampered,ports),/journal/i);
 assert.equal(await node.client.getTransactionCount({address:account.address}),15);
 }finally{await node.stop();}
});
