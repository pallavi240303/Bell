import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('CRE SDK is isolated from the root TypeScript project with explicit verification scripts', () => {
  const config = JSON.parse(readFileSync(`${root}tsconfig.json`, 'utf8'));
  const manifest = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
  assert.ok(config.exclude?.includes('cre/bell-market-event'));
  assert.equal(manifest.scripts['test:cre'], 'npm --prefix cre/bell-market-event test');
  assert.equal(manifest.scripts['typecheck:cre'], 'npm --prefix cre/bell-market-event run typecheck');
  assert.equal(manifest.scripts['build:cre'], 'npm --prefix cre/bell-market-event run build');
});

function run(command: string, args: string[], input?: string) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', input });
}

test('workspace typecheck runs from the repository root', () => {
  const result = run('npm', ['run', 'typecheck']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('direct dependencies have exact versions and matching lockfile entries', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  assert.ok(Object.keys(dependencies).length > 0, 'TypeScript toolchain must be declared');
  for (const [name, version] of Object.entries(dependencies)) {
    assert.match(String(version), /^\d+\.\d+\.\d+$/);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
  }
});

test('contract builds use the tracked contract package paths', () => {
  const config = run('forge', ['config', '--json']);
  assert.equal(config.status, 0, config.stdout + config.stderr);
  const parsed = JSON.parse(config.stdout);
  assert.equal(parsed.src, 'contracts/src');
  assert.equal(parsed.test, 'contracts/test');
  assert.equal(parsed.script, 'contracts/script');
  assert.deepEqual(parsed.libs, ['contracts/lib']);
  for (const boundary of ['engine', 'services/keeper', 'cre', 'src', 'scripts', 'tests']) {
    assert.ok(existsSync(`${root}${boundary}/README.md`), `${boundary} boundary is missing`);
  }
});

test('environment example is empty and runtime outputs are ignored', () => {
  const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  const entries = example.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  assert.ok(entries.length > 0);
  for (const entry of entries) assert.match(entry, /^[A-Z][A-Z0-9_]*=$/);
  const ignored = [
    '.env', '.env.local', 'node_modules/example', 'dist/example', 'out/example',
    'cache/example', 'broadcast/example', 'deployments/runs/example',
    'evidence/runs/example', 'services/keeper/runs/example', 'coverage/example',
    'test-results/example', 'playwright-report/example',
  ];
  const result = run('git', ['check-ignore', '--stdin'], `${ignored.join('\n')}\n`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ignored);
  assert.equal(run('git', ['check-ignore', '--no-index', '.env.example']).status, 1);
});

test('unimplemented verification stages fail with an actionable message', () => {
  for (const stage of ['test:integration', 'test:e2e']) {
    const result = run('npm', ['run', stage]);
    assert.equal(result.status, 1, `${stage}: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /not implemented.*package/i);
  }
});

test('replay verification invokes the implemented keeper runner', () => {
  const manifest = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
  assert.equal(manifest.scripts['verify:replay'], 'node --import tsx services/keeper/cli.ts replay');
  assert.ok(existsSync(`${root}services/keeper/replay.ts`));
});
