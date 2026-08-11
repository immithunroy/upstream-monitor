import { parseLinuxLine } from '../src/services/traceroute';

const linuxOutput = [
  ' 1  172.29.0.1 (172.29.0.1)  0.090 ms  0.030 ms  0.026 ms',
  ' 2  103.177.54.1 (103.177.54.1)  0.305 ms  0.226 ms  0.248 ms',
  ' 3  10.131.175.229 (10.131.175.229)  4.177 ms  4.096 ms  5.205 ms',
  ' 4  * * *',
  ' 5  one.one.one.one (1.1.1.1)  3.678 ms  4.816 ms  3.737 ms',
];

let failures = 0;

for (const [idx, line] of linuxOutput.entries()) {
  try {
    const hop = parseLinuxLine(line);
    if (!hop) {
      console.error(`line ${idx + 1}: expected a hop, got null`);
      failures++;
      continue;
    }
    if (idx === 3) {
      if (hop.status !== 'unreachable') {
        console.error(`line ${idx + 1}: expected unreachable, got ${hop.status}`);
        failures++;
      }
      continue;
    }
    if (hop.rtts.length !== 3) {
      console.error(`line ${idx + 1}: expected 3 rtts, got ${hop.rtts.length}: ${JSON.stringify(hop.rtts)}`);
      failures++;
    }
    if (idx === 4 && (hop.ip !== '1.1.1.1' || hop.avgRtt === null)) {
      console.error(`line ${idx + 1}: bad ip/avgRtt: ${JSON.stringify(hop)}`);
      failures++;
    }
  } catch (e) {
    console.error(`line ${idx + 1}: threw: ${e instanceof Error ? e.message : e}`);
    failures++;
  }
}

if (failures) {
  console.error(`FAIL: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('OK: linux traceroute parser handles all sample lines');
