/**
 * One-time migration: copies all data from the legacy MongoDB database into
 * PostgreSQL. Run once with the backend stopped / before switching to PG:
 *
 *   MONGODB_URI="mongodb://user:pass@host:27017/upstream_monitor" \
 *   DATABASE_URL="postgresql://upstream:pass@host:5432/upstream_monitor" \
 *   npx tsx scripts/migrate-mongo-to-postgres.ts
 *
 * Existing PostgreSQL rows are not duplicated (it truncates first).
 */
import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/upstream_monitor';

interface MongoDestination {
  _id: string;
  name: string;
  host: string;
  category: string;
  location?: string;
  region?: string;
  description?: string;
  enabled?: boolean;
  createdBy?: string;
  ipAddress?: string;
  asn?: number | null;
  company?: string;
  registry?: string;
  country?: string;
  prefix?: string;
  enrichedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MongoTraceReport {
  _id: string;
  destinationId: string;
  destHost: string;
  destName?: string;
  asn?: number | null;
  company?: string;
  triggeredBy?: string;
  startedAt?: Date;
  completedAt?: Date | null;
  durationMs?: number;
  reachable?: boolean;
  ping?: {
    success?: boolean;
    packetsSent?: number;
    packetsReceived?: number;
    lossPercent?: number;
    minRtt?: number | null;
    maxRtt?: number | null;
    avgRtt?: number | null;
  };
  hops?: Array<{
    ttl: number;
    ip?: string | null;
    host?: string | null;
    status?: string;
    rtts?: number[];
    avgRtt?: number | null;
    asn?: number | null;
    company?: string;
  }>;
  pathFingerprint?: string;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MongoChangeEvent {
  _id: string;
  destinationId: string;
  destHost: string;
  destName?: string;
  severity?: string;
  summary: string;
  previousReportId?: string | null;
  currentReportId?: string | null;
  changes?: Array<{
    type: string;
    field?: string;
    hopTtl?: number | null;
    oldValue?: unknown;
    newValue?: unknown;
    message: string;
  }>;
  acknowledged?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MongoPingSample {
  _id: string;
  destinationId: string;
  destHost: string;
  destName?: string;
  success?: boolean;
  minRtt?: number | null;
  maxRtt?: number | null;
  avgRtt?: number | null;
  lossPercent?: number;
  packetsSent?: number;
  packetsReceived?: number;
  sampledAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const mongo = mongoose.connection.db;
  if (!mongo) throw new Error('mongo connection failed');

  const destColl = mongo.collection('destinations');
  const reportColl = mongo.collection('tracereports');
  const changeColl = mongo.collection('changeevents');
  const pingColl = mongo.collection('pingsamples');

  // --- Clear PG tables (children first) ---
  await prisma.changeDetail.deleteMany();
  await prisma.changeEvent.deleteMany();
  await prisma.traceHop.deleteMany();
  await prisma.traceReport.deleteMany();
  await prisma.pingSample.deleteMany();
  await prisma.destination.deleteMany();

  // --- Destinations ---
  const dests = (await destColl.find({}).toArray()) as unknown as MongoDestination[];
  console.log(`[migrate] destinations: ${dests.length}`);
  for (const d of dests) {
    await prisma.destination.create({
      data: {
        id: d._id,
        name: d.name,
        host: d.host,
        category: d.category || 'service',
        location: d.location ?? '',
        region: d.region ?? '',
        description: d.description ?? '',
        enabled: d.enabled ?? true,
        createdBy: d.createdBy ?? 'seed',
        ipAddress: d.ipAddress ?? '',
        asn: d.asn ?? null,
        company: d.company ?? '',
        registry: d.registry ?? '',
        country: d.country ?? '',
        prefix: d.prefix ?? '',
        enrichedAt: d.enrichedAt ?? null,
        createdAt: d.createdAt ?? new Date(),
        updatedAt: d.updatedAt ?? new Date(),
      },
    });
  }

  // --- Trace reports (with hops) ---
  const reports = (await reportColl.find({}).toArray()) as unknown as MongoTraceReport[];
  console.log(`[migrate] trace reports: ${reports.length}`);
  const destIdSet = new Set(dests.map((d) => String(d._id)));
  let reportsSkipped = 0;
  for (const r of reports) {
    if (!destIdSet.has(String(r.destinationId))) {
      reportsSkipped += 1;
      continue;
    }
    await prisma.traceReport.create({
      data: {
        id: r._id,
        destinationId: r.destinationId,
        destHost: r.destHost,
        destName: r.destName ?? '',
        asn: r.asn ?? null,
        company: r.company ?? '',
        triggeredBy: r.triggeredBy ?? 'scheduler',
        startedAt: r.startedAt ?? new Date(),
        completedAt: r.completedAt ?? null,
        durationMs: r.durationMs ?? 0,
        reachable: r.reachable ?? false,
        pingSuccess: r.ping?.success ?? false,
        pingPacketsSent: r.ping?.packetsSent ?? 0,
        pingPacketsReceived: r.ping?.packetsReceived ?? 0,
        pingLossPercent: r.ping?.lossPercent ?? 100,
        pingMinRtt: r.ping?.minRtt ?? null,
        pingMaxRtt: r.ping?.maxRtt ?? null,
        pingAvgRtt: r.ping?.avgRtt ?? null,
        pathFingerprint: r.pathFingerprint ?? '',
        error: r.error ?? '',
        createdAt: r.createdAt ?? new Date(),
        updatedAt: r.updatedAt ?? new Date(),
        hops: {
          create: (r.hops ?? []).map((h) => ({
            ttl: h.ttl,
            ip: h.ip ?? null,
            host: h.host ?? null,
            status: h.status ?? 'unreachable',
            rtts: h.rtts ?? [],
            avgRtt: h.avgRtt ?? null,
            asn: h.asn ?? null,
            company: h.company ?? '',
          })),
        },
      },
    });
  }
  if (reportsSkipped > 0) console.log(`[migrate] trace reports skipped (orphan destination): ${reportsSkipped}`);

  // --- Change events (with details) ---
  const changes = (await changeColl.find({}).toArray()) as unknown as MongoChangeEvent[];
  console.log(`[migrate] change events: ${changes.length}`);
  let changesSkipped = 0;
  for (const c of changes) {
    if (!destIdSet.has(String(c.destinationId))) {
      changesSkipped += 1;
      continue;
    }
    await prisma.changeEvent.create({
      data: {
        id: c._id,
        destinationId: c.destinationId,
        destHost: c.destHost,
        destName: c.destName ?? '',
        severity: c.severity ?? 'info',
        summary: c.summary,
        previousReportId: c.previousReportId ?? null,
        currentReportId: c.currentReportId ?? null,
        acknowledged: c.acknowledged ?? false,
        createdAt: c.createdAt ?? new Date(),
        updatedAt: c.updatedAt ?? new Date(),
        changes: {
          create: (c.changes ?? []).map((ch) => ({
            type: ch.type,
            field: ch.field ?? '',
            hopTtl: ch.hopTtl ?? null,
            oldValue: ch.oldValue !== undefined && ch.oldValue !== null ? (ch.oldValue as object) : undefined,
            newValue: ch.newValue !== undefined && ch.newValue !== null ? (ch.newValue as object) : undefined,
            message: ch.message,
          })),
        },
      },
    });
  }
  if (changesSkipped > 0) console.log(`[migrate] change events skipped (orphan destination): ${changesSkipped}`);

  // --- Ping samples ---
  const pings = (await pingColl.find({}).toArray()) as unknown as MongoPingSample[];
  console.log(`[migrate] ping samples: ${pings.length}`);
  let pingsSkipped = 0;
  for (const p of pings) {
    // Skip samples whose destination no longer exists (orphaned rows).
    if (!destIdSet.has(String(p.destinationId))) {
      pingsSkipped += 1;
      continue;
    }
    await prisma.pingSample.create({
      data: {
        id: p._id,
        destinationId: p.destinationId,
        destHost: p.destHost,
        destName: p.destName ?? '',
        success: p.success ?? false,
        minRtt: p.minRtt ?? null,
        maxRtt: p.maxRtt ?? null,
        avgRtt: p.avgRtt ?? null,
        lossPercent: p.lossPercent ?? 100,
        packetsSent: p.packetsSent ?? 0,
        packetsReceived: p.packetsReceived ?? 0,
        sampledAt: p.sampledAt ?? new Date(),
        createdAt: p.createdAt ?? new Date(),
        updatedAt: p.updatedAt ?? new Date(),
      },
    });
  }
  if (pingsSkipped > 0) console.log(`[migrate] ping samples skipped (orphan destination): ${pingsSkipped}`);

  console.log('[migrate] DONE');
  await prisma.$disconnect();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[migrate] failed:', err);
  await prisma.$disconnect();
  await mongoose.disconnect();
  process.exit(1);
});
