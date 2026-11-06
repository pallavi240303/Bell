import { Runner, CronCapability, handler } from '@chainlink/cre-sdk';
import { configSchema, type Config } from './schema.ts';
import { runWorkflow } from './workflow.ts';
const initWorkflow = (config: Config) => [handler(new CronCapability().trigger({ schedule: config.cron }), runWorkflow)];
export async function main() { const runner = await Runner.newRunner({ configSchema }); await runner.run(initWorkflow); }
