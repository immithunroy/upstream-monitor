import { execFile } from 'node:child_process';
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
  const pingCount = getSettingNumber('pingCount', 10);
  const pingTimeoutMs = getSettingNumber('pingTimeoutMs', 2500);
  const args = isWindows
    ? ['-n', String(pingCount), '-w', String(pingTimeoutMs), host]
    : ['-c', String(pingCount), '-W', String(Math.round(pingTimeoutMs / 1000)), host];
  const out = await run('ping', args, pingCount * pingTimeoutMs + 5000);
  return isWindows ? parsePingWindows(out) : parsePingLinux(out);
}

/* ---------------------------- TRACEROUTE ---------------------------- */

const HOP_RE = /^\s*(\d+)\s+(.*)$/;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const MS_RE = /([\d.,]+)\s*ms/g;

export function parseLinuxLine(line: string): TraceHop | null {
  const m = line.match(HOP_RE);
  if (!m) return null;
  const ttl = Number(m[1]);
  const rest = m[2];
  if (rest.trim().startsWith('*')) {
    return { ttl, ip: null, host: null, status: 'unreachable', rtts: [], avgRtt: null, asn: null, company: '' };
  }
  const ipMatch = rest.match(IP_RE);
  const ip = ipMatch ? ipMatch[0] : null;
  const host = ip ? rest.split(' ')[0] : rest.trim().split(' ')[0];
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
  const ipMatch = rest.match(IP_RE);
  if (!ipMatch) {
    return { ttl, ip: null, host: null, status: 'unreachable', rtts: [], avgRtt: null, asn: null, company: '' };
  }
  const ip = ipMatch[0];
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
  const traceMaxHops = getSettingNumber('traceMaxHops', 30);
  const traceTimeoutSeconds = getSettingNumber('traceTimeoutSeconds', 4);
  const args = isWindows
    ? ['-d', '-h', String(traceMaxHops), '-w', String(traceTimeoutSeconds), host]
    : [
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
        host,
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
  const [ping, hops] = await Promise.all([runPing(host), runTraceroute(host)]);
  const reachable = ping.packetsReceived > 0 || hops.some((h) => h.status === 'reachable');
  return { reachable, ping, hops, pathFingerprint: fingerprint(hops) };
}
