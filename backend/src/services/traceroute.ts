import { execFile } from 'node:child_process';
import net from 'node:net';
import dns from 'node:dns/promises';
import os from 'node:os';
import { getSettingNumber } from './settings';
import type { PingResult, TraceHop } from '../models/TraceReport';

export interface TraceOutcome {
  reachable: boolean;
  ping: PingResult;
  hops: TraceHop[];
  pathFingerprint: string;
}

const isWindows = os.platform() === 'win32';

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const proc = execFile(
      cmd,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) {
          resolve('');
          return;
        }
        resolve(stdout || '');
      }
    );
    proc.on('error', () => resolve(''));
  });
}

function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number.parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve a destination to a concrete IP before probing. This matters for IPv6:
 * net.isIP() only recognises literal addresses, so a hostname that resolves to
 * an AAAA record (or an IPv6 literal wrapped in brackets) would otherwise be
 * probed over IPv4 and fail. Resolving first guarantees the `-6` family flag is
 * applied for IPv6 targets while keeping hostname destinations working.
 *
 * Lookups are bounded to 3s and cached for 60s so a slow or unreachable DNS
 * server can never stall the ping sweep or a trace.
 */
const dnsCache = new Map<string, { ip: string; at: number }>();

function lookupWithTimeout(hostname: string, timeoutMs: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('DNS lookup timed out'));
      }
    }, timeoutMs);
    dns
      .lookup(hostname, { all: true })
      .then((addrs) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(addrs.map((a) => a.address));
        }
      })
      .catch((err) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

async function resolveHost(host: string): Promise<string> {
  let h = host.trim();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (net.isIP(h) === 4 || net.isIP(h) === 6) return h;
  const cached = dnsCache.get(h);
  if (cached && Date.now() - cached.at < 60_000) return cached.ip;
  try {
    const addrs = await lookupWithTimeout(h, 3000);
    const ip = addrs[0] ?? h;
    dnsCache.set(h, { ip, at: Date.now() });
    return ip;
  } catch {
    dnsCache.set(h, { ip: h, at: Date.now() });
    return h;
  }
}

/* ------------------------------ PING ------------------------------ */

function parsePingLinux(out: string): PingResult {
  const result: PingResult = {
    success: false,
    packetsSent: 0,
    packetsReceived: 0,
    lossPercent: 100,
    minRtt: null,
    maxRtt: null,
    avgRtt: null,
  };
  const stats = out.match(/(\d+) packets transmitted,\s*(\d+)(?: received|\s+received)/);
  if (stats) {
    result.packetsSent = Number(stats[1]);
    result.packetsReceived = Number(stats[2]);
    result.success = result.packetsReceived > 0;
    result.lossPercent =
      result.packetsSent > 0
        ? Math.round(((result.packetsSent - result.packetsReceived) / result.packetsSent) * 1000) / 10
        : 100;
  }
  const rtt = out.match(/rtt min\/avg\/max\/mdev\s*=\s*([\d.,]+)\/([\d.,]+)\/([\d.,]+)\/([\d.,]+)/);
  if (rtt) {
    result.minRtt = num(rtt[1]);
    result.avgRtt = num(rtt[2]);
    result.maxRtt = num(rtt[3]);
  }
  return result;
}

function parsePingWindows(out: string): PingResult {
  const result: PingResult = {
    success: false,
    packetsSent: 0,
    packetsReceived: 0,
    lossPercent: 100,
    minRtt: null,
    maxRtt: null,
    avgRtt: null,
  };
  const sent = out.match(/Packets:\s+Sent\s*=\s*(\d+)/i);
  const received = out.match(/Received\s*=\s*(\d+)/i);
  if (sent) result.packetsSent = Number(sent[1]);
  if (received) result.packetsReceived = Number(received[1]);
  result.success = result.packetsReceived > 0;
  result.lossPercent =
    result.packetsSent > 0
      ? Math.round(((result.packetsSent - result.packetsReceived) / result.packetsSent) * 1000) / 10
      : 100;
  const rtt = out.match(/Minimum\s*=\s*(\d+)ms,\s*Maximum\s*=\s*(\d+)ms,\s*Average\s*=\s*(\d+)ms/i);
  if (rtt) {
    result.minRtt = Number(rtt[1]);
    result.maxRtt = Number(rtt[2]);
    result.avgRtt = Number(rtt[3]);
  }
  return result;
}

export async function runPing(host: string): Promise<PingResult> {
  const target = await resolveHost(host);
  const pingCount = getSettingNumber('pingCount', 10);
  const pingTimeoutMs = getSettingNumber('pingTimeoutMs', 2500);
  const ipv6 = net.isIP(target) === 6;
  const args = isWindows
    ? ['-n', String(pingCount), '-w', String(pingTimeoutMs), ...(ipv6 ? ['-6'] : []), target]
    : ['-c', String(pingCount), '-W', String(Math.round(pingTimeoutMs / 1000)), ...(ipv6 ? ['-6'] : []), target];
  const out = await run('ping', args, pingCount * pingTimeoutMs + 5000);
  return isWindows ? parsePingWindows(out) : parsePingLinux(out);
}

/* ---------------------------- TRACEROUTE ---------------------------- */

const HOP_RE = /^\s*(\d+)\s+(.*)$/;
const MS_RE = /([\d.,]+)\s*ms/g;

/**
 * Extract the first IPv4 or IPv6 address from a traceroute line. Uses
 * node:net.isIP so both families (including compressed IPv6 like `2001:db8::1`
 * and link-local zones) are recognised without fragile regexes.
 */
function extractIp(rest: string): string | null {
  for (const tok of rest.split(/\s+/)) {
    const clean = tok.replace(/^\(|\)$/g, '').replace(/%[0-9a-zA-Z]+$/, '');
    if (net.isIP(clean) === 4 || net.isIP(clean) === 6) return clean;
  }
  return null;
}

export function parseLinuxLine(line: string): TraceHop | null {
  const m = line.match(HOP_RE);
  if (!m) return null;
  const ttl = Number(m[1]);
  const rest = m[2];
  if (rest.trim().startsWith('*')) {
    return { ttl, ip: null, host: null, status: 'unreachable', rtts: [], avgRtt: null, asn: null, company: '' };
  }
  const ip = extractIp(rest);
  const host = ip ?? rest.trim().split(/\s+/)[0] ?? null;
  const rtts = Array.from(rest.matchAll(MS_RE)).map((x) => num(x[1]) as number).filter((v) => v !== null);
  return {
    ttl,
    ip,
    host: host || null,
    status: ip ? 'reachable' : 'unreachable',
    rtts,
    avgRtt: rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : null,
    asn: null,
    company: '',
  };
}

function parseWindowsLine(line: string): TraceHop | null {
  const m = line.match(/^\s*(\d+)\s+(.*)$/);
  if (!m) return null;
  const ttl = Number(m[1]);
  const rest = m[2].trim();
  const ip = extractIp(rest);
  if (!ip) {
    return { ttl, ip: null, host: null, status: 'unreachable', rtts: [], avgRtt: null, asn: null, company: '' };
  }
  const rtts = Array.from(rest.matchAll(/(?:<1|\d+)\s*ms/g)).map((x) =>
    x[0].startsWith('<') ? 1 : Number.parseFloat(x[0])
  );
  return {
    ttl,
    ip,
    host: null,
    status: 'reachable',
    rtts,
    avgRtt: rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : null,
    asn: null,
    company: '',
  };
}

export async function runTraceroute(host: string): Promise<TraceHop[]> {
  const target = await resolveHost(host);
  const traceMaxHops = getSettingNumber('traceMaxHops', 30);
  const traceTimeoutSeconds = getSettingNumber('traceTimeoutSeconds', 4);
  const ipv6 = net.isIP(target) === 6;
  const args = isWindows
    ? ['-6', '-d', '-h', String(traceMaxHops), '-w', String(traceTimeoutSeconds), target]
    : [
        ...(ipv6 ? ['-6'] : []),
        // ICMP echo mode (-I): the destination answers ICMP (ping works) but may
        // silently drop UDP traceroute probes, which would hide the final hop.
        '-I',
        '-m',
        String(traceMaxHops),
        '-w',
        String(traceTimeoutSeconds),
        '-q',
        '2',
        '-n',
        target,
      ];
  const out = await run(isWindows ? 'tracert' : 'traceroute', args, traceMaxHops * traceTimeoutSeconds * 1000 + 15000);

  const hops: TraceHop[] = [];
  const lines = out.split(/\r?\n/);
  for (const line of lines) {
    const hop = isWindows ? parseWindowsLine(line) : parseLinuxLine(line);
    if (hop) hops.push(hop);
  }
  return hops;
}

function fingerprint(hops: TraceHop[]): string {
  return hops
    .map((h) => (h.ip ? h.ip : '*'))
    .join(' > ');
}

export async function runTrace(host: string): Promise<TraceOutcome> {
  const target = await resolveHost(host);
  const [ping, hops] = await Promise.all([runPing(target), runTraceroute(target)]);
  const reachable = ping.packetsReceived > 0 || hops.some((h) => h.status === 'reachable');
  return { reachable, ping, hops, pathFingerprint: fingerprint(hops) };
}
