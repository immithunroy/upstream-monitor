import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

async function main() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;

  // Import app after env is set
  const { app } = await import('../src/server');
  const { connectDb } = await import('../src/config/db');
  const { seedDestinations } = await import('../src/services/seed');
  const { Destination } = await import('../src/models/Destination');

  await connectDb();
  await seedDestinations();

  // Mock RIR RDAP lookups only; pass through everything else (localhost API).
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('rdap.org/autnum') || url.includes('rdap.org/ip')) {
      return new Response(JSON.stringify({ name: 'Test Org', entities: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input as RequestInfo | URL, init);
  }) as typeof fetch;

  const server = app.listen(0, () => {
    /* listening */
  });
  await new Promise((r) => setTimeout(r, 300));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/api`;

  let pass = 0;
  let total = 0;
  const ok = (name: string, cond: boolean) => {
    total++;
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  };

  // 1. health
  const health = await fetch(`${base}/health`).then((r) => r.json());
  ok('health endpoint', health.status === 'ok');

  // 2. seeded destinations present
  const dests = await fetch(`${base}/destinations`).then((r) => r.json());
  ok('destinations seeded', Array.isArray(dests) && dests.length > 30);

  // 3. unauthenticated destination write rejected
  const denied = await fetch(`${base}/destinations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', host: 'x.com' }) });
  ok('destination write requires admin (401)', denied.status === 401);

  // 4. login + admin token
  const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || 'admin123' }) });
  const loginJson = await login.json();
  ok('admin login works', login.status === 200 && Boolean(loginJson.token));
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${loginJson.token}` };

  // 5. authenticated destination create/delete
  const created = await fetch(`${base}/destinations`, { method: 'POST', headers, body: JSON.stringify({ name: 'Test Dest', host: 'example.test', category: 'service' }) });
  const createdJson = await created.json();
  ok('destination create (admin)', created.status === 201 && createdJson._id);
  const del = await fetch(`${base}/destinations/${createdJson._id}`, { method: 'DELETE', headers });
  ok('destination delete (admin)', del.status === 200);

  // 6. RIR enrichment endpoint attributes an IP host (mock RDAP, IP bypasses DNS)
  const ipDest = await fetch(`${base}/destinations`, { method: 'POST', headers, body: JSON.stringify({ name: 'Resolver Test', host: '8.8.4.4', category: 'service' }) });
  const ipDestJson = await ipDest.json();
  ok('create IP host', ipDest.status === 201 && ipDestJson._id);

  const enrich = await fetch(`${base}/destinations/enrich`, { method: 'POST', headers });
  const enrichJson = await enrich.json();
  ok('enrich endpoint responds', enrich.status === 200 && typeof enrichJson.total === 'number');

  // POST /enrich awaits the lookup pipeline, so the IP host is attributed now.
  const ipDestAfter = await fetch(`${base}/destinations/${ipDestJson._id}`).then((r) => r.json());
  ok('destination attributed (asn/company)', Boolean(ipDestAfter.enrichedAt) && (Boolean(ipDestAfter.asn) || Boolean(ipDestAfter.company)));

  // 7. global search
  const search = await fetch(`${base}/search?q=google`).then((r) => r.json());
  ok('search returns grouped results', search.destinations.some((d: { title: string }) => d.title.toLowerCase().includes('google')));
  const searchAsn = await fetch(`${base}/search?q=AS13335`).then((r) => r.json());
  ok('search by ASN works', Array.isArray(searchAsn.destinations));

  // 8. stats include new 24h metrics
  const stats = await fetch(`${base}/stats`).then((r) => r.json());
  ok('stats has uptime24h + avgRtt24h', 'uptime24h' in stats && 'avgRtt24h' in stats);

  const trend = await fetch(`${base}/stats/trend?hours=24`).then((r) => r.json());
  ok('stats/trend returns array', Array.isArray(trend));

  // 9. period report endpoints
  const period = await fetch(`${base}/reports/period?period=weekly`).then((r) => r.json());
  ok('period report weekly', period.period === 'weekly' && typeof period.overall === 'object' && Array.isArray(period.destinations));
  const badPeriod = await fetch(`${base}/reports/period?period=fortnightly`);
  ok('invalid period rejected', badPeriod.status === 400);

  // 10. hop-by-hop compare endpoint (insert two reports directly)
  const { TraceReport } = await import('../src/models/TraceReport');
  const hopBase = { status: 'reachable', rtts: [10, 11, 12], avgRtt: 11, asn: null, company: '' };
  const r1 = await TraceReport.create({
    destinationId: ipDestJson._id,
    destHost: '8.8.4.4',
    destName: 'Resolver Test',
    reachable: true,
    ping: { success: true, packetsSent: 4, packetsReceived: 4, lossPercent: 0, minRtt: 10, maxRtt: 12, avgRtt: 11 },
    hops: [
      { ttl: 1, ip: '192.168.1.1', ...hopBase },
      { ttl: 2, ip: '10.0.0.1', ...hopBase },
      { ttl: 3, ip: '8.8.4.4', ...hopBase },
    ],
    pathFingerprint: '192.168.1.1 > 10.0.0.1 > 8.8.4.4',
    startedAt: new Date(Date.now() - 3600 * 1000),
  });
  const r2 = await TraceReport.create({
    destinationId: ipDestJson._id,
    destHost: '8.8.4.4',
    destName: 'Resolver Test',
    reachable: true,
    ping: { success: true, packetsSent: 4, packetsReceived: 4, lossPercent: 0, minRtt: 10, maxRtt: 12, avgRtt: 11 },
    hops: [
      { ttl: 1, ip: '192.168.1.1', ...hopBase },
      { ttl: 2, ip: '10.0.0.2', ...hopBase },
      { ttl: 3, ip: '8.8.4.4', ...hopBase },
    ],
    pathFingerprint: '192.168.1.1 > 10.0.0.2 > 8.8.4.4',
    startedAt: new Date(),
  });
  const cmp = await fetch(`${base}/reports/${r2._id}/compare`).then((r) => r.json());
  const ipChange = cmp.diff.find((d: { ttl: number }) => d.ttl === 2);
  ok('compare has previous report', cmp.hasPrevious === true);
  ok('compare diff detects hop IP change', ipChange && ipChange.change === 'hop_ip_change' && ipChange.prevIp === '10.0.0.1' && ipChange.currIp === '10.0.0.2');
  ok('compare diff marks unchanged hop', cmp.diff.find((d: { ttl: number }) => d.ttl === 1)?.change === 'same');

  // 11. legacy routes removed (BGP / routers)
  const bgp404 = await fetch(`${base}/bgp/peers?routerId=x`);
  const routers404 = await fetch(`${base}/routers`);
  ok('BGP routes removed (404)', bgp404.status === 404);
  ok('router routes removed (404)', routers404.status === 404);

  // cleanup
  globalThis.fetch = originalFetch;
  await fetch(`${base}/destinations/${ipDestJson._id}`, { method: 'DELETE', headers });
  server.close();
  await mongoose.disconnect();
  await mongod.stop();

  console.log(`\n${pass}/${total} checks passed`);
  if (pass < total) process.exit(1);
}

main().catch((e) => {
  console.error('E2E FAILED:', e);
  process.exit(1);
});
