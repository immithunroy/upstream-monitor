import { mapLimit, parseAsNameLine, parseCymruLine, parseRdapOrg, resolveIp } from '../src/services/rir';

async function main() {
  let failures = 0;
  const check = (name: string, cond: boolean) => {
    console.log(`${cond ? 'OK' : 'FAIL'}  ${name}`);
    if (!cond) failures++;
  };

  // cymru line parsing (7-field with IP column + AS name)
  const parsed = parseCymruLine('15169 | 8.8.8.8 | 8.8.8.0/24 | US | arin | 1992-12-01 | GOOGLE, US');
  check('cymru line parsed', parsed?.asn === 15169 && parsed?.prefix === '8.8.8.0/24' && parsed?.country === 'US' && parsed?.registry === 'arin' && (parsed?.company ?? '').includes('GOOGLE'));

  // cymru origin.ASN returns 5 fields, no IP column, no AS name (live format)
  const parsed5 = parseCymruLine('1200 | 185.55.136.0/22 | NL | ripencc | 2014-04-25');
  check('cymru 5-field line parsed', parsed5?.asn === 1200 && parsed5?.prefix === '185.55.136.0/22' && parsed5?.country === 'NL' && parsed5?.registry === 'ripencc' && (parsed5?.company ?? '') === '');

  const privateNet = parseCymruLine('| 10.0.0.1 | | | | |');
  check('malformed line -> null or no asn', privateNet === null || privateNet.asn === null);

  // AS-name lookup parsing (AS<asn>.asn.cymru.com)
  const asName = parseAsNameLine('1200 | NL | ripencc | 1993-09-01 | AMS-IX1 - Amsterdam Internet Exchange B.V., NL');
  check('as-name parsed', (asName ?? '').includes('AMS-IX1 - Amsterdam Internet Exchange B.V.'));
  check('as-name malformed -> null', parseAsNameLine('junk') === null);

  // RDAP org extraction
  const rdap = parseRdapOrg({
    name: 'GOOGLE, US',
    entities: [
      { roles: ['registrant'], vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'Google LLC']]] },
    ],
  });
  check('rdap name preferred', rdap === 'GOOGLE, US');

  const rdap2 = parseRdapOrg({
    entities: [
      { roles: ['registrant'], vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['org', {}, 'text', 'RIPE Network Coordination Centre']]] },
    ],
  });
  check('rdap org from vcard', rdap2 === 'RIPE Network Coordination Centre');

  const rdap3 = parseRdapOrg({ name: '', entities: [] });
  check('rdap empty -> null', rdap3 === null);

  // resolveIp: literal IP passthrough, no DNS needed
  const resolvedIp = await resolveIp('8.8.8.8');
  check('resolveIp passes through IP', resolvedIp === '8.8.8.8');

  // mapLimit ordering + concurrency bound
  const order: number[] = [];
  let active = 0;
  let peak = 0;
  await mapLimit([1, 2, 3, 4, 5, 6], 2, async (v) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    order.push(v);
    active -= 1;
    return v;
  });
  check('mapLimit keeps order', order.join(',') === '1,2,3,4,5,6');
  check('mapLimit bounded concurrency', peak === 2);

  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nALL RIR TESTS PASSED');
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
