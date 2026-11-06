import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { errorData } from './cli.ts';
import { SolidityError } from './types.ts';
import { encode, abiParameters } from './quote.ts';
import { parseAbiParameters,keccak256,stringToHex } from 'viem';
import { SNAPSHOT_ABI, STEP_ABI } from './cli.ts';
test('token string reverts and allowance custom errors retain exact Solidity ABI',()=>{
  assert.equal(errorData(new SolidityError('Error',['allowance'])),`0x08c379a0${encode('string',['allowance']).slice(2)}`);
  const spender=`0x${'1'.padStart(40,'0')}` as const;
  assert.equal(errorData(new SolidityError('ERC20InsufficientAllowance',[spender,2n,3n])),`0xfb8f41b2${encode('address,uint256,uint256',[spender,2n,3n]).slice(2)}`);
});
test('regression: no-argument Solidity errors encode the selector without an ABI parameter list',()=>{
  assert.equal(errorData(new SolidityError('ZeroDenominator')),'0x1d1e6f5b');
});
test('CLI rejects malformed input and emits deterministic canonical structured results',()=>{
  const run=(input:string)=>spawnSync(process.execPath,['--import','tsx','engine/cli.ts'],{input,encoding:'utf8'});
  const a=run(JSON.stringify([{op:'mulDivUp',args:['10','10','3']},{op:'mulDivDown',args:['1','1','0']}]));
  assert.equal(a.status,0,a.stderr);assert.deepEqual(JSON.parse(a.stdout),[{ok:true,value:'34'},{ok:false,error:{name:'ZeroDenominator',args:[]}}]);
  assert.equal(run('[{"op":"mulDivUp","args":[1,"1","1"]}]').status,1);
  assert.equal(run('[{"op":"mulDivUp","args":["01","1","1"]}]').status,1);
  for(const invalid of ['-1',(1n<<256n).toString()]){
    const rejected=run(JSON.stringify([{op:'mulDivUp',args:[invalid,'1','1']}]));
    assert.equal(rejected.status,1);assert.equal(rejected.stdout,'');
    assert.match(rejected.stderr,invalid==='-1'?/canonical decimal strings/:/invalid uint256/);
  }
  assert.equal(run('{').stdout,'');assert.equal(run('{').status,1);
});

test('oracle and cover-manager AssetHalted overloads preserve distinct exact selectors',()=>{
 const asset=`0x${'1'.padStart(64,'0')}` as const;
 assert.equal(errorData(new SolidityError('AssetHalted')),keccak256(stringToHex('AssetHalted()')).slice(0,10));
 assert.equal(errorData(new SolidityError('AssetHalted',[asset])),keccak256(stringToHex('AssetHalted(bytes32)')).slice(0,10)+encode('bytes32',[asset]).slice(2));
});
test('canonical nested ABI parser matches dependency output and handles full snapshot/action schemas',()=>{
 const schema='(uint256 id,(address owner,uint64 time) data)[] rows,bytes32 digest';
 assert.deepEqual(abiParameters(schema),parseAbiParameters(schema));
 assert.equal(abiParameters(SNAPSHOT_ABI).length,1);assert.equal(abiParameters(STEP_ABI).length,1);
});
