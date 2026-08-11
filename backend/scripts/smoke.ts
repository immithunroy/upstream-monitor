import { runPing, runTraceroute, runTrace } from '../src/services/traceroute';

async function main() {
  console.log('--- ping 1.1.1.1 ---');
  const ping = await runPing('1.1.1.1');
  console.log(JSON.stringify(ping, null, 2));

  console.log('--- traceroute 1.1.1.1 ---');
  const hops = await runTraceroute('1.1.1.1');
  console.log('hop count:', hops.length);
  console.log(hops.slice(0, 5));

  console.log('--- full trace ---');
  const t = await runTrace('google.com');
  console.log('reachable:', t.reachable);
  console.log('pathFingerprint:', t.pathFingerprint.slice(0, 200));
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
