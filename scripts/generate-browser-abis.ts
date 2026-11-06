import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const contracts={manager:'CoverManager',loanManager:'LoanManager',book:'CommitmentBook',pool:'ProtectedPool',vault:'LoanVault',cash:'MockCashToken',stock:'MockStockToken',oracle:'SessionOracle',registry:'AssetRegistry',receiver:'SimulationMarketEventReceiver'};
const abis=Object.fromEntries(Object.entries(contracts).map(([key,name])=>[key,JSON.parse(readFileSync(`${root}out/${name}.sol/${name}.json`,'utf8')).abi]));
const source=`// Generated from Foundry artifacts. Run npm run abi:generate.\nexport const abis = ${JSON.stringify(abis,null,2)} as const;\n`;
const target=`${root}src/generated/abis.ts`;
if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==source)throw Error('Browser ABI stale: run npm run abi:generate');}
else writeFileSync(target,source);
