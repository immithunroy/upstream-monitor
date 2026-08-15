import prisma from '../config/prisma';
import { runPing } from './traceroute';

/**
 * Runs a 10-packet ping sweep against every enabled destination and stores the
 * min / max / avg latency as a PingSample (used by the destination page graphs).
 *
 * Pings the destination's already-resolved `ipAddress` (falling back to the
 * hostname) so no DNS lookups are needed on the hot path, and guards against
 * overlapping sweeps if one takes longer than the configured interval.
 */
let sweepRunning = false;

export async function runPingSweep(): Promise<number> {
  if (sweepRunning) return 0;
  sweepRunning = true;
  let samples = 0;
  try {
    const dests = await prisma.destination.findMany({ where: { enabled: true }, orderBy: { name: 'asc' } });
    for (const dest of dests) {
      try {
        const ping = await runPing(dest.ipAddress || dest.host);
        await prisma.pingSample.create({
          data: {
            destinationId: dest.id,
            destHost: dest.host,
            destName: dest.name,
            success: ping.success,
            minRtt: ping.minRtt,
            maxRtt: ping.maxRtt,
            avgRtt: ping.avgRtt,
            lossPercent: ping.lossPercent,
            packetsSent: ping.packetsSent,
            packetsReceived: ping.packetsReceived,
            sampledAt: new Date(),
          },
        });
        samples += 1;
      } catch (err) {
        console.error(`[ping] ${dest.host} failed:`, (err as Error).message);
      }
    }
    if (samples > 0) {
      console.log(`[ping] sweep complete: ${samples}/${dests.length} destinations sampled`);
    }
  } finally {
    sweepRunning = false;
  }
  return samples;
}

/** Immediately samples a single destination (fire from the trace-now button). */
export async function sampleDestinationNow(destHost: string): Promise<void> {
  const ping = await runPing(destHost);
  const dest = await prisma.destination.findUnique({ where: { host: destHost } });
  if (!dest) return;
  await prisma.pingSample.create({
    data: {
      destinationId: dest.id,
      destHost: dest.host,
      destName: dest.name,
      success: ping.success,
      minRtt: ping.minRtt,
      maxRtt: ping.maxRtt,
      avgRtt: ping.avgRtt,
      lossPercent: ping.lossPercent,
      packetsSent: ping.packetsSent,
      packetsReceived: ping.packetsReceived,
      sampledAt: new Date(),
    },
  });
}
