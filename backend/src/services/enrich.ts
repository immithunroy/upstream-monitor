import { env } from '../config/env';
import prisma from '../config/prisma';
import { lookupIp, mapLimit, resolveIp } from './rir';
import type { TraceHop } from '../models/TraceReport';

/** Whether a destination's RIR attribution is fresh enough to skip re-lookup. */
function isStale(enrichedAt: Date | null): boolean {
  const ttl = env.rirCacheTtlHours * 3600 * 1000;
  if (!enrichedAt) return true;
  return Date.now() - enrichedAt.getTime() > ttl;
}

/** Resolve + attribute a single destination host (used for create/update). */
export async function enrichDestinationHost(host: string): Promise<{
  ipAddress: string;
  asn: number | null;
  company: string;
  registry: string;
  country: string;
  prefix: string;
}> {
  const empty = { ipAddress: '', asn: null, company: '', registry: '', country: '', prefix: '' };
  const ip = await resolveIp(host);
  if (!ip) return empty;
  const info = await lookupIp(ip);
  if (!info) return { ...empty, ipAddress: ip };
  return {
    ipAddress: ip,
    asn: info.asn,
    company: info.company || '',
    registry: info.registry || '',
    country: info.country || '',
    prefix: info.prefix || '',
  };
}

/** Enrich a single destination record if it is stale. */
export async function maybeEnrichDestination(destId: string, host: string): Promise<void> {
  const dest = await prisma.destination.findUnique({ where: { id: destId }, select: { enrichedAt: true } });
  if (!dest) return;
  if (!isStale(dest.enrichedAt)) return;
  try {
    const data = await enrichDestinationHost(host);
    await prisma.destination.update({
      where: { id: destId },
      data: { ...data, enrichedAt: new Date() },
    });
    console.log(`[rir] enriched ${host} -> AS${data.asn ?? '?'} ${data.company}`);
  } catch (err) {
    console.error(`[rir] enrichment failed for ${host}:`, (err as Error).message);
  }
}

/**
 * Enrich a set of hop IPs with ASN + company using the shared RIR cache.
 * Unresolvable / non-routable IPs are left without attribution.
 */
export async function enrichHops(hops: TraceHop[]): Promise<TraceHop[]> {
  const ips = Array.from(new Set(hops.map((h) => h.ip).filter((ip): ip is string => !!ip)));
  const byIp = new Map<string, { asn: number | null; company: string }>();
  await mapLimit(ips, env.rirEnrichConcurrency, async (ip) => {
    try {
      const info = await lookupIp(ip);
      if (info) byIp.set(ip, { asn: info.asn, company: info.company || '' });
    } catch {
      /* ignore single-hop lookup failures */
    }
  });
  return hops.map((h) => {
    if (!h.ip) return { ...h, asn: null, company: '' };
    const attrs = byIp.get(h.ip);
    return attrs ? { ...h, asn: attrs.asn, company: attrs.company } : { ...h, asn: null, company: '' };
  });
}

/**
 * Lazily enrich a single report's hops in place. If any hop is missing ASN /
 * company attribution, enrich the missing IPs and persist back to Postgres.
 * Returns the (possibly updated) hops array.
 */
export async function ensureReportHopsEnriched(report: {
  id: unknown;
  hops?: TraceHop[] | null;
}): Promise<TraceHop[]> {
  const hops: TraceHop[] = (report.hops ?? []) as TraceHop[];
  const missing = hops.some((h) => (h.ip ? (h.asn ?? null) === null && !(h.company ?? '') : false));
  if (!missing) return hops;
  const enriched = await enrichHops(hops);
  try {
    await prisma.traceHop.deleteMany({ where: { reportId: String(report.id) } });
    await prisma.traceHop.createMany({
      data: enriched.map((h) => ({
        reportId: String(report.id),
        ttl: h.ttl,
        ip: h.ip,
        host: h.host,
        status: h.status,
        rtts: h.rtts,
        avgRtt: h.avgRtt,
        asn: h.asn,
        company: h.company,
      })),
    });
  } catch {
    /* persist failures are non-fatal on read paths */
  }
  return enriched;
}

/** Bulk enrich all destinations with a bounded concurrency pool. */
export async function enrichAllDestinations(): Promise<{
  total: number;
  enriched: number;
  failed: number;
}> {
  const dests = await prisma.destination.findMany({ select: { id: true, host: true, name: true } });
  let enriched = 0;
  let failed = 0;
  await mapLimit(dests, env.rirEnrichConcurrency, async (dest) => {
    try {
      const data = await enrichDestinationHost(dest.host);
      await prisma.destination.update({
        where: { id: dest.id },
        data: { ...data, enrichedAt: new Date() },
      });
      if (data.asn !== null || data.company) enriched += 1;
      console.log(`[rir] ${dest.host} -> AS${data.asn ?? '?'} ${data.company || '(no registry match)'}`);
    } catch {
      failed += 1;
    }
  });
  return { total: dests.length, enriched, failed };
}
