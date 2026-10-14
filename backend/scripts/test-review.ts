/* Assertion tests for the 2026-10-14 review fixes. Run: npm run test:review */
import { compareReports } from '../src/services/comparator';
import { parseLinuxLine } from '../src/services/traceroute';
import { pingCronExpression } from '../src/services/scheduler';
import { cleanHost } from '../src/lib/hostValidation';
import { loginBlocked, recordLoginFailure } from '../src/routes/admin';
import cron from 'node-cron';

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`);
}
const base = (o: Record<string, unknown> = {}) => ({
  _id: 'x', destinationId: 'd', destHost: 't.com', reachable: true,
  ping: { lossPercent: 0, avgRtt: 15 }, hops: [{ ttl: 1, ip: '1.1.1.1', avgRtt: 10, asn: null, company: '' }],
  pathFingerprint: '1.1.1.1', ...o,
}) as never;

eq('recovery is not critical', compareReports(base({ reachable: false }), base()).severity, 'warning');
eq('becoming unreachable is critical', compareReports(base(), base({ reachable: false })).severity, 'critical');
eq('1 lost packet (10%) over 5% threshold, loss up = critical', compareReports(base(), base({ ping: { lossPercent: 10, avgRtt: 15 } })).severity, 'critical');
eq('loss down = warning', compareReports(base({ ping: { lossPercent: 20, avgRtt: 15 } }), base()).severity, 'warning');
eq('loss change below threshold ignored', compareReports(base(), base({ ping: { lossPercent: 2, avgRtt: 15 } })).changes.length, 0);

eq('partial-star hop is reachable', parseLinuxLine(' 5  * 10.0.0.1  5.1 ms')?.ip, '10.0.0.1');
eq('all-star hop unreachable', parseLinuxLine(' 4  * *')?.status, 'unreachable');

for (const m of [1, 5, 59, 60, 90, 120, 720, 1440]) eq(`cron for ${m}m valid`, cron.validate(pingCronExpression(m)), true);
eq('cron 120m', pingCronExpression(120), '0 */2 * * *');

eq('host ipv4', cleanHost(' 1.1.1.1 '), '1.1.1.1');
eq('host [v6]', cleanHost('[2001:db8::1]'), '2001:db8::1');
eq('host name', cleanHost('Example.COM'), 'example.com');
eq('host option injection', cleanHost('-f'), null);
eq('host junk', cleanHost('a b; rm'), null);

for (let i = 0; i < 10; i++) recordLoginFailure('9.9.9.9', 1000);
eq('login blocked after 10', loginBlocked('9.9.9.9', 2000), true);
eq('login unblocked after window', loginBlocked('9.9.9.9', 1000 + 16 * 60 * 1000), false);

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all review tests passed');
