import cron from 'node-cron';
import { env } from '../config/env';
import { runScheduledTrace } from './orchestrator';

let traceTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  /* Hourly traceroute monitoring */
  if (!traceTask) {
    if (cron.validate(env.traceCron)) {
      traceTask = cron.schedule(env.traceCron, async () => {
        console.log(`[scheduler] hourly trace triggered (${new Date().toISOString()})`);
        const started = await runScheduledTrace();
        if (!started) {
          console.log('[scheduler] a trace run is already in progress, skipping this tick');
        }
      });
      console.log(`[scheduler] hourly tracing enabled with cron "${env.traceCron}"`);
    } else {
      console.error(`[scheduler] invalid cron expression: ${env.traceCron}`);
    }
  }
}

export function stopScheduler(): void {
  if (traceTask) {
    traceTask.stop();
    traceTask = null;
  }
}
