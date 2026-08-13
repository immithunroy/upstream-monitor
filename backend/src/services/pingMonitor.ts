import prisma from '../config/prisma';
import { runPing } from './traceroute';

/**
 * Runs a 10-packet ping sweep against every enabled destination and stores the
 * min / max / avg latency as a PingSample (used by the destination page graphs).
 */
export async function runPingSweep(): Promise<number> {
  const dests = await prisma.destination.findMany({ where: { enabled: true }, orderBy: { name: 'asc' } });
  let samples = 0;
  for (const dest of dests) {
    try {
      const ping = await runPing(dest.host);
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
