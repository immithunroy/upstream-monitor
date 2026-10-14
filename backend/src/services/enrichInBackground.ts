import prisma from '../config/prisma';
import { enrichDestinationHost } from './enrich';

/** Fire-and-forget RIR attribution for one destination. Never rejects (an
 *  unhandled rejection here used to crash the API, e.g. when the destination
 *  was deleted before the lookup finished). */
export function enrichInBackground(where: { id: string } | { host: string }, host: string): void {
  void enrichDestinationHost(host)
    .then((data) => prisma.destination.update({ where: where as never, data: { ...data, enrichedAt: new Date() } }))
    .catch((err) => console.error(`[rir] background enrichment failed for ${host}:`, (err as Error).message));
}
