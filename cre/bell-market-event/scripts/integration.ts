import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const result = spawnSync('forge', ['test', '--match-contract', 'CREWorkflowIntegrationTest', '-vv'], { cwd: root, env: { ...process.env, FOUNDRY_TEST: 'cre/bell-market-event/tests/solidity' }, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
