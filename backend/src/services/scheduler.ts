import cron from 'node-cron';
import { getSetting, getSettingNumber } from './settings';
import { runScheduledTrace } from './orchestrator';
import { runPingSweep } from './pingMonitor';
import { runRetention } from './retention';

let traceTask: cron.ScheduledTask | null = null;
let pingTask: cron.ScheduledTask | null = null;
let retentionTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  const traceCron = String(getSetting('traceCron') || '0 */6 * * *');
  const pingIntervalMinutes = getSettingNumber('pingIntervalMinutes', 5);
  const retentionDays = getSettingNumber('retentionDays', 365);

  /* Traceroute monitoring — default once every 6 hours */
  if (!traceTask) {
    if (cron.validate(traceCron)) {
      traceTask = cron.schedule(traceCron, async () => {
        console.log(`[scheduler] trace triggered (${new Date().toISOString()})`);
        const started = await runScheduledTrace();
        if (!started) {
          console.log('[scheduler] a trace run is already in progress, skipping this tick');
        }
      });
      console.log(`[scheduler] tracing enabled with cron "${traceCron}"`);
    } else {
      console.error(`[scheduler] invalid cron expression: ${traceCron}`);
    }
  }

  /* Frequent latency sampling — default every 5 minutes */
  if (!pingTask) {
    pingTask = cron.schedule(`*/${pingIntervalMinutes} * * * *`, async () => {
      try {
        await runPingSweep();
      } catch (err) {
        console.error('[scheduler] ping sweep failed:', (err as Error).message);
      }
    });
    console.log(`[scheduler] ping monitoring enabled every ${pingIntervalMinutes} minutes`);
  }

  /* Data retention — purge anything older than RETENTION_DAYS (default 1 year) */
  if (!retentionTask) {
    retentionTask = cron.schedule('0 3 * * *', async () => {
      try {
        await runRetention();
      } catch (err) {
        console.error('[scheduler] retention run failed:', (err as Error).message);
      }
    });
    console.log(`[scheduler] data retention enabled (keep ${retentionDays} days, daily at 03:00)`);
  }
}

/** Stop + restart the cron jobs so schedule changes apply immediately. */
export function restartScheduler(): void {
  stopScheduler();
  startScheduler();
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
  if (retentionTask) {
    retentionTask.stop();
    retentionTask = null;
  }
}