const stage = process.argv[2] ?? 'requested stage';

console.error(`${stage} is not implemented until its package is added.`);
process.exitCode = 1;
