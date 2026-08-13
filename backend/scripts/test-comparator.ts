import { compareReports } from '../src/services/comparator';
import type { TraceReportDoc } from '../src/models/TraceReport';

function report(overrides: Partial<TraceReportDoc>): TraceReportDoc {
  return {
    _id: 'x' as never,
    destinationId: 'd' as never,
    destHost: 'test.com',
    destName: 'Test',
    triggeredBy: 'scheduler',
    startedAt: new Date(),
    completedAt: new Date(),
    durationMs: 1000,
    reachable: true,
    ping: { success: true, packetsSent: 4, packetsReceived: 4, lossPercent: 0, minRtt: 10, maxRtt: 20, avgRtt: 15 },
    hops: [
      { ttl: 1, ip: '1.1.1.1', host: null, status: 'reachable', rtts: [10], avgRtt: 10 },
      { ttl: 2, ip: '2.2.2.2', host: null, status: 'reachable', rtts: [20], avgRtt: 20 },
    ],
    pathFingerprint: '1.1.1.1 > 2.2.2.2',
    error: '',
    ...overrides,
  } as TraceReportDoc;
}

function check(name: string, a: TraceReportDoc, b: TraceReportDoc) {
  const r = compareReports(a, b);
  console.log(`\n== ${name} ==`);
  console.log('severity:', r.severity, '| summary:', r.summary);
  for (const c of r.changes) console.log(`  [${c.type}${c.hopTtl ? ' ttl=' + c.hopTtl : ''}] ${c.message}`);
}

// 1. Identical reports -> no changes
check('identical', report({}), report({}));

// 2. Path change
check(
  'path change',
  report({}),
  report({ hops: [
    { ttl: 1, ip: '1.1.1.1', host: null, status: 'reachable', rtts: [10], avgRtt: 10 },
    { ttl: 2, ip: '9.9.9.9', host: null, status: 'reachable', rtts: [25], avgRtt: 25 },
  ], pathFingerprint: '1.1.1.1 > 9.9.9.9' })
);

// 3. Unreachable
check(
  'became unreachable',
  report({}),
  report({ reachable: false, ping: { success: false, packetsSent: 4, packetsReceived: 0, lossPercent: 100, minRtt: null, maxRtt: null, avgRtt: null }, hops: [] })
);

// 4. Big RTT jump
check(
  'rtt jump',
  report({}),
  report({ ping: { success: true, packetsSent: 4, packetsReceived: 4, lossPercent: 0, minRtt: 100, maxRtt: 120, avgRtt: 110 } })
);

// 5. Hop removed
check(
  'hop removed',
  report({}),
  report({ hops: [{ ttl: 1, ip: '1.1.1.1', host: null, status: 'reachable', rtts: [10], avgRtt: 10 }], pathFingerprint: '1.1.1.1' })
);

// 6. AS path change (most vital -> critical) — SAME hop AS changed vs previous
check(
  'AS path change (same hop AS differs)',
  report({ hops: [
    { ttl: 1, ip: '1.1.1.1', host: null, status: 'reachable', rtts: [10], avgRtt: 10, asn: 15169, company: 'Google' },
    { ttl: 2, ip: '2.2.2.2', host: null, status: 'reachable', rtts: [20], avgRtt: 20, asn: 3356, company: 'Level3' },
  ] }),
  report({ hops: [
    { ttl: 1, ip: '1.1.1.1', host: null, status: 'reachable', rtts: [10], avgRtt: 10, asn: 15169, company: 'Google' },
    { ttl: 2, ip: '3.3.3.3', host: null, status: 'reachable', rtts: [22], avgRtt: 22, asn: 2914, company: 'NTT' },
  ] })
);

// 7. Intra-trace AS transition is NORMAL (packets hop AS A -> AS B at different
//    TTLs) — must NOT be flagged as a route change.
check(
  'intra-trace AS transition (normal, not a change)',
  report({ hops: [
    { ttl: 1, ip: '1.1.1.1', host: null, status: 'reachable', rtts: [10], avgRtt: 10, asn: 15169, company: 'Google' },
    { ttl: 2, ip: '2.2.2.2', host: null, status: 'reachable', rtts: [20], avgRtt: 20, asn: 3356, company: 'Level3' },
  ] }),
  report({ hops: [
    { ttl: 1, ip: '1.1.1.1', host: null, status: 'reachable', rtts: [10], avgRtt: 10, asn: 15169, company: 'Google' },
    { ttl: 2, ip: '2.2.2.2', host: null, status: 'reachable', rtts: [20], avgRtt: 20, asn: 3356, company: 'Level3' },
  ] })
);

// 8. ASN known in one report but unknown (null) in the other — enrichment gap,
//    not a real route change — must NOT be flagged critical.
check(
  'ASN null in one report (enrichment gap, not a change)',
  report({ hops: [
    { ttl: 1, ip: '1.1.1.1', host: null, status: 'reachable', rtts: [10], avgRtt: 10, asn: 15169, company: 'Google' },
    { ttl: 2, ip: '2.2.2.2', host: null, status: 'reachable', rtts: [20], avgRtt: 20, asn: 3356, company: 'Level3' },
  ] }),
  report({ hops: [
    { ttl: 1, ip: '1.1.1.1', host: null, status: 'reachable', rtts: [10], avgRtt: 10, asn: 15169, company: 'Google' },
    { ttl: 2, ip: '3.3.3.3', host: null, status: 'reachable', rtts: [22], avgRtt: 22, asn: null, company: '' },
  ] })
);
