import dns from 'node:dns/promises';
import net from 'node:net';
import { getSettingNumber } from './settings';

/**
 * ASN + company attribution for a destination IP, sourced from Regional
 * Internet Registry (RIR) data:
 *  - team-cymru `whois.cymru.com` origin-ASN service (aggregates ARIN/RIPE/
 *    APNIC/LACNIC/AFRINIC registration data via DNS TXT)
 *  - RDAP bootstrap (rdap.org) to enrich with the authoritative RIR org name
 */

export interface AsnInfo {
  ip: string;
  asn: number | null;
  company: string;
  prefix: string;
  country: string;
  registry: string;
}

const cache = new Map<string, { info: AsnInfo | null; at: number }>();

function cacheTtlMs(): number {
  return getSettingNumber('rirCacheTtlHours', 24) * 3600 * 1000;
}

function requestTimeoutMs(): number {
  return getSettingNumber('rirRequestTimeoutMs', 10000);
}

export async function resolveIp(host: string): Promise<string | null> {
  const trimmed = host.trim();
  if (net.isIP(trimmed) === 4 || net.isIP(trimmed) === 6) return trimmed;
  try {
    const lookup = await dns.lookup(trimmed, { all: true });
    return lookup[0]?.address ?? null;
  } catch {
    return null;
  }
}

/**
 * Expand an IPv6 address to its full 32-hex-digit form (no colons), so the
 * team-cymru origin6 reverse-DNS lookup can reverse it nibble by nibble.
 */
function expandIpv6(ip: string): string {
  let s = ip.split('%')[0].toLowerCase();
  const lastColon = s.lastIndexOf(':');
  if (lastColon >= 0) {
    const tail = s.slice(lastColon + 1);
    if (tail.includes('.')) {
      const [a, b, c, d] = tail.split('.').map((x) => Number(x));
      const hex =
        ((a << 8) | b).toString(16).padStart(4, '0') +
        ((c << 8) | d).toString(16).padStart(4, '0');
      s = s.slice(0, lastColon + 1) + hex;
    }
  }
  if (s.includes('::')) {
    const [left, right] = s.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    const missing = 8 - leftParts.length - rightParts.length;
    const parts = [...leftParts, ...Array(Math.max(0, missing)).fill('0000'), ...rightParts].map((p) =>
      p.padStart(4, '0')
    );
    return parts.join('');
  }
  return s.split(':').map((p) => p.padStart(4, '0')).join('');
}

/**
 * Parse a team-cymru origin.ASN response line. Two formats occur in practice:
 *  - without IP column: `ASN | BGP Prefix | Country | Registry | Allocated | AS Name`
 *  - with IP column:    `ASN | IP | BGP Prefix | Country | Registry | Allocated | AS Name`
 * Disambiguate via the first data field (an IP has no slash; a prefix does).
 */
export function parseCymruLine(line: string): Omit<AsnInfo, 'ip'> | null {
  const parts = line.split('|').map((s) => s.trim());
  if (parts.length < 5) return null;
  const asn = Number.parseInt(parts[0], 10);
  const hasIpColumn = !parts[1].includes('/');
  const prefix = hasIpColumn ? parts[2] ?? '' : parts[1] ?? '';
  const country = hasIpColumn ? parts[3] ?? '' : parts[2] ?? '';
  const registry = hasIpColumn ? parts[4] ?? '' : parts[3] ?? '';
  const company = hasIpColumn && parts.length >= 7 ? parts[6] || '' : '';
  return {
    asn: Number.isFinite(asn) ? asn : null,
    company,
    prefix,
    country,
    registry,
  };
}

/** Parse a team-cymru AS-name response line:
 *  `ASN | Country | Registry | Allocated | AS Name` */
export function parseAsNameLine(line: string): string | null {
  const parts = line.split('|').map((s) => s.trim());
  if (parts.length < 5) return null;
  return parts[4] || null;
}

/** Extract the organisation name from an RDAP response for an ASN/network. */
export function parseRdapOrg(data: unknown): string | null {
  const root = data as {
    name?: string;
    entities?: Array<{
      roles?: string[];
      vcardArray?: [string, unknown[][]];
    }>;
  };
  if (!root) return null;
  const names: string[] = [];
  if (typeof root.name === 'string' && root.name.length > 0) names.push(root.name);
  const entities = Array.isArray(root.entities) ? root.entities : [];
  for (const e of entities) {
    const vcard = e.vcardArray?.[1];
    if (!Array.isArray(vcard)) continue;
    for (const entry of vcard) {
      if (!Array.isArray(entry) || entry.length < 4) continue;
      const key = String(entry[0]).toLowerCase();
      if (key === 'fn' && typeof entry[3] === 'string') names.push(entry[3]);
      if (key === 'org' && typeof entry[3] === 'string') names.push(entry[3]);
    }
  }
  return names.find((n) => n.length > 0) ?? null;
}

async function cymruLookup(ip: string): Promise<Omit<AsnInfo, 'ip'> | null> {
  const v6 = net.isIP(ip) === 6;
  // IPv4: 1.2.3.4 -> 4.3.2.1.origin.asn.cymru.com
  // IPv6: expanded nibbles reversed -> ...origin6.asn.cymru.com
  const reversed = v6
    ? expandIpv6(ip).split('').reverse().join('.')
    : ip.split('.').reverse().join('.');
  const zone = v6 ? 'origin6' : 'origin';
  try {
    const txt = await dns.resolveTxt(`${reversed}.${zone}.asn.cymru.com`);
    const parts = txt.flat();
    if (parts.length === 0) return null;
    const line = parts.find((p) => p.includes('|'));
    if (!line) return null;
    return parseCymruLine(line);
  } catch {
    return null;
  }
}

async function cymruAsName(asn: number): Promise<string | null> {
  try {
    const txt = await dns.resolveTxt(`AS${asn}.asn.cymru.com`);
    const parts = txt.flat();
    const line = parts.find((p) => p.includes('|'));
    if (!line) return null;
    return parseAsNameLine(line);
  } catch {
    return null;
  }
}

async function rdapAsnName(asn: number): Promise<{ company: string | null; registry: string | null }> {
  try {
    const res = await fetch(`https://rdap.org/autnum/AS${asn}`, {
      signal: AbortSignal.timeout(requestTimeoutMs()),
      redirect: 'follow',
      headers: { Accept: 'application/rdap+json, application/json' },
    });
    if (!res.ok) return { company: null, registry: null };
    const data = await res.json();
    const company = parseRdapOrg(data);
    const registry = (data as { port43?: string }).port43
      ?.match(/whois\.([a-z0-9-]+)\.net/i)?.[1]
      ?.toUpperCase() ?? null;
    return { company, registry };
  } catch {
    return { company: null, registry: null };
  }
}

async function rdapIpOrg(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://rdap.org/ip/${ip}`, {
      signal: AbortSignal.timeout(requestTimeoutMs()),
      redirect: 'follow',
      headers: { Accept: 'application/rdap+json, application/json' },
    });
    if (!res.ok) return null;
    return parseRdapOrg(await res.json());
  } catch {
    return null;
  }
}

/** Full lookup: cymru first, then RDAP to refine the org name / registry. */
export async function lookupIp(ip: string): Promise<AsnInfo | null> {
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.at < cacheTtlMs()) return cached.info;

  const base = await cymruLookup(ip);
  let info: AsnInfo | null = null;

  if (base && base.asn !== null) {
    info = { ip, ...base };
    // The origin.ASN query doesn't include the AS name — fetch it separately,
    // falling back to RDAP if the name is still missing.
    if (!info.company) {
      const asName = await cymruAsName(base.asn);
      if (asName) info.company = asName;
    }
    if (!info.company || info.company === '-') {
      const rdap = await rdapAsnName(base.asn);
      if (rdap.company) info.company = rdap.company;
      if (rdap.registry) info.registry = rdap.registry;
    }
  } else {
    const company = await rdapIpOrg(ip);
    if (company) {
      info = { ip, asn: null, company, prefix: '', country: '', registry: '' };
    }
  }

  if (info) cache.set(ip, { info, at: Date.now() });
  return info;
}

/** Small concurrency-limited pool over an array of items. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function clearAsnCache(): void {
  cache.clear();
}
