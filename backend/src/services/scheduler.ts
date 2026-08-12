import cron from 'node-cron';
import { env } from '../config/env';
import { runScheduledTrace } from './orchestrator';
import { runPingSweep } from './pingMonitor';

let traceTask: cron.ScheduledTask | null = null;
let pingTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  /* Traceroute monitoring — default once every 6 hours */
  if (!traceTask) {
    if (cron.validate(env.traceCron)) {
      traceTask = cron.schedule(env.traceCron, async () => {
        console.log(`[scheduler] trace triggered (${new Date().toISOString()})`);
        const started = await runScheduledTrace();
        if (!started) {
          console.log('[scheduler] a trace run is already in progress, skipping this tick');
        }
      });
      console.log(`[scheduler] tracing enabled with cron "${env.traceCron}"`);
    } else {
      console.error(`[scheduler] invalid cron expression: ${env.traceCron}`);
    }
  }

  /* Frequent latency sampling — default every 5 minutes */
  if (!pingTask) {
    pingTask = cron.schedule(`*/${env.pingIntervalMinutes} * * * *`, async () => {
      try {
        await runPingSweep();
      } catch (err) {
        console.error('[scheduler] ping sweep failed:', (err as Error).message);
      }
    });
    console.log(`[scheduler] ping monitoring enabled every ${env.pingIntervalMinutes} minutes`);
  }
}

export function stopScheduler(): void {
  if (traceTask) {
    traceTask.stop();
    traceTask = null;
  }
  if (pingTask) {
    pingTask.stop();
    pingTask = null;
  }
}
