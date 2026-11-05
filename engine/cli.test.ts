import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { errorData } from './cli.ts';
import { SolidityError } from './types.ts';
test('regression: no-argument Solidity errors encode the selector without an ABI parameter list',()=>{
  assert.equal(errorData(new SolidityError('ZeroDenominator')),'0x1d1e6f5b');
});
test('CLI rejects malformed input and emits deterministic canonical structured results',()=>{
  const run=(input:string)=>spawnSync(process.execPath,['--import','tsx','engine/cli.ts'],{input,encoding:'utf8'});
  const a=run(JSON.stringify([{op:'mulDivUp',args:['10','10','3']},{op:'mulDivDown',args:['1','1','0']}]));
  assert.equal(a.status,0,a.stderr);assert.deepEqual(JSON.parse(a.stdout),[{ok:true,value:'34'},{ok:false,error:{name:'ZeroDenominator',args:[]}}]);
  assert.equal(run('[{"op":"mulDivUp","args":[1,"1","1"]}]').status,1);
  assert.equal(run('[{"op":"mulDivUp","args":["01","1","1"]}]').status,1);
  assert.equal(run('{').stdout,'');assert.equal(run('{').status,1);
});
