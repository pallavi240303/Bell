import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const sdk=JSON.parse(readFileSync(new URL('../node_modules/@chainlink/cre-sdk/package.json',import.meta.url),'utf8'));
console.log(JSON.stringify({sdk:sdk.version,bunRequirement:sdk.engines.bun}));
let missing=false;
for(const [command,args] of [['bun',['--version']],['cre',['version']]]){
  const result=spawnSync(command,args,{encoding:'utf8'});
  if(result.error || result.status!==0){console.log(`MISSING ${command}`);missing=true;continue;}
  console.log(`${command}: ${result.stdout.trim()}`);
  if(command==='bun'){
    const parts=result.stdout.trim().split('.').map(Number);
    if(parts[0]<1 || (parts[0]===1 && (parts[1]<2 || (parts[1]===2 && parts[2]<21)))){console.log('INCOMPATIBLE bun: SDK requires >=1.2.21');missing=true;}
  }
}
console.log('Compatibility proof requires npm run build and an actual cre workflow simulate invocation.');
process.exitCode=missing?1:0;
