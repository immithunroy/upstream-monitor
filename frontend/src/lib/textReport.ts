import type { ChangeEvent, Destination, PeriodReport, PingSample, TraceReport } from './types';
import { CATEGORY_LABEL, fmtDate, fmtRtt } from './format';

const W = 80;
const BLOCK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const SEV_ICON: Record<string, string> = { critical: '✖', warning: '▲', info: 'ℹ' };

function rep(ch: string, n: number): string {
  return ch.repeat(Math.max(0, n));
}

function pad(s: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  if (s.length >= width) return s;
  const diff = width - s.length;
  if (align === 'right') return rep(' ', diff) + s;
  if (align === 'center') {
    const l = Math.floor(diff / 2);
    return rep(' ', l) + s + rep(' ', diff - l);
  }
  return s + rep(' ', diff);
}

function section(text: string): string {
  return `── ${text} ${rep('─', Math.max(2, W - text.length - 5))}`;
}

function kv(label: string, value: string, width = 22): string {
  return `${pad(label, width)}${value}`;
}

function kvPairs(left: [string, string], right: [string, string] | null = null): string {
  const cell = (l: string, v: string) => `${pad(l, 16)}${pad(v, 24)}`;
  return cell(left[0], left[1]) + (right ? cell(right[0], right[1]) : rep(' ', 40));
}

function bar(frac: number, width = 20): string {
  const filled = Math.round(Math.max(0, Math.min(1, frac)) * width);
  return rep('█', filled) + rep('░', width - filled);
}

function sparkline(values: Array<number | null>, width = 60): string {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return rep(' ', width);
  const step = finite.length / width;
  const buckets: Array<number | null> = [];
  for (let i = 0; i < width; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let sum = 0;
    let n = 0;
    for (let j = start; j < end && j < finite.length; j++) {
      sum += finite[j];
      n++;
    }
    buckets.push(n ? sum / n : null);
  }
  const usable = buckets.filter((v): v is number => v !== null);
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const range = max - min || 1;
  return buckets
    .map((v) => (v === null ? ' ' : BLOCK[Math.min(7, Math.floor(((v - min) / range) * 7))]))
    .join('');
}

interface BoxCol {
  header: string;
  align?: 'left' | 'right' | 'center';
  min?: number;
  max?: number;
  flex?: number;
  noShrink?: boolean;
}

function truncate(s: string, w: number): string {
  if (s.length <= w) return s;
  return s.slice(0, Math.max(1, w - 1)) + '…';
}

function boxTable(cols: BoxCol[], rows: string[][], target = W): string[] {
  const n = cols.length;
  const natural = cols.map((c, i) => {
    let w = c.header.length;
    for (const r of rows) w = Math.max(w, (r[i] ?? '').length);
    return w;
  });
  const borders = n * 2 + (n + 1);
  const budget = Math.max(1, target - borders);
  const widths = natural.map((w, i) => Math.max(cols[i].min ?? 1, Math.min(w, cols[i].max ?? Infinity)));
  let used = widths.reduce((a, b) => a + b, 0);
  if (used < budget) {
    const flexSum = cols.reduce((a, c) => a + (c.flex ?? 1), 0);
    let extra = budget - used;
    for (let i = 0; i < n; i++) {
      const share = Math.floor((extra * (cols[i].flex ?? 1)) / flexSum);
      widths[i] += share;
      extra -= share;
    }
    if (extra > 0) widths[n - 1] += extra;
  } else if (used > budget) {
    // Shrink flexible columns first, but never shrink columns marked noShrink
    // (e.g. IP / ASN must always render in full). If the fixed columns still
    // exceed the report width, the table simply renders a little wider.
    let over = used - budget;
    const shrinkable = [...Array(n).keys()].filter((i) => !cols[i].noShrink && widths[i] > (cols[i].min ?? 1));
    shrinkable.sort((a, b) => (cols[a].flex ?? 1) - (cols[b].flex ?? 1));
    for (const i of shrinkable) {
      if (over <= 0) break;
      const min = cols[i].min ?? 1;
      const s = Math.min(widths[i] - min, over);
      widths[i] -= s;
      over -= s;
    }
  }
  const line = (l: string, m: string, r: string) =>
    l + widths.map((w) => rep('─', w + 2)).join(m) + r;
  const render = (cells: string[]) =>
    `│${cells.map((c, i) => ` ${pad(truncate(c ?? '', widths[i]), widths[i], cols[i].align)} `).join('│')}│`;
  const out: string[] = [];
  out.push(line('┌', '┬', '┐'));
  out.push(render(cols.map((c) => c.header)));
  out.push(line('├', '┼', '┤'));
  for (const r of rows) out.push(render(r));
  out.push(line('└', '┴', '┘'));
  return out;
}

const PATH_COLS: BoxCol[] = [
  { header: 'TTL', align: 'right', min: 3, max: 5, flex: 0 },
  { header: 'IP', min: 8, max: 46, flex: 0, noShrink: true },
  { header: 'ASN', min: 7, max: 13, flex: 0, noShrink: true },
  { header: 'Company', min: 14, max: 60, flex: 1 },
  { header: 'Avg RTT', align: 'right', min: 8, max: 12, flex: 0 },
];

function asPath(hops: TraceReport['hops']): string {
  const seq = hops.map((h) => (h.asn ? `AS${h.asn}` : '?')).join(' ▸ ');
  return seq || '—';
}

function statusLabel(reachable: boolean): string {
  return reachable ? 'REACHABLE' : 'UNREACHABLE';
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportTraceText(report: TraceReport): string {
  const lines: string[] = [];
  lines.push('┌' + rep('─', W - 2) + '┐');
  lines.push('│' + pad('UPSTREAM MONITOR · NETWORK PATH EXPORT', W - 2, 'center') + '│');
  lines.push('└' + rep('─', W - 2) + '┘');
  lines.push('');
  lines.push(kv('Destination', report.destName || report.destHost));
  lines.push(kv('Host', report.destHost));
  lines.push(kv('Trace time', fmtDate(report.startedAt)));
  lines.push(kv('Duration', `${report.durationMs} ms`));
  lines.push(kv('Trigger', report.triggeredBy));
  lines.push(kv('Result', statusLabel(report.reachable)));
  lines.push(kv('Ping', `sent ${report.ping.packetsSent} · received ${report.ping.packetsReceived} · loss ${report.ping.lossPercent}%`));
  lines.push(
    kv('RTT', `min ${fmtRtt(report.ping.minRtt)} · avg ${fmtRtt(report.ping.avgRtt)} · max ${fmtRtt(report.ping.maxRtt)}`)
  );
  lines.push(kv('Path', `${report.hops.length} hops — ${report.hops.map((h) => h.ip ?? '*').join(' ▸ ')}`));
  lines.push(kv('AS path', asPath(report.hops)));
  lines.push(kv('Path fingerprint', report.pathFingerprint || '—'));
  lines.push('');
  lines.push(section('HOPS'));
  lines.push('');
  const rows = report.hops.map((h) => [
    String(h.ttl),
    h.ip ?? '*',
    h.asn ? `AS${h.asn}` : '—',
    h.company || '—',
    fmtRtt(h.avgRtt),
  ]);
  if (rows.length === 0) {
    lines.push('  No hops captured (unreachable).');
  } else {
    lines.push(...boxTable(PATH_COLS, rows));
  }
  lines.push('');
  lines.push(rep('═', W));
  return lines.join('\n');
}

export interface DestinationReportInput {
  dest: Destination;
  reports: TraceReport[];
  events: ChangeEvent[];
  pings: PingSample[];
  periodReport: PeriodReport | null;
}

export function buildDestinationTextReport(input: DestinationReportInput): string {
  const { dest, reports, events, pings, periodReport } = input;
  const lines: string[] = [];

  lines.push(rep('═', W));
  lines.push('│' + pad('UPSTREAM MONITOR · DESTINATION REPORT', W - 2, 'center') + '│');
  lines.push(rep('═', W));
  lines.push('');
  lines.push(kv('Generated', `${new Date().toLocaleString()} · period ${periodReport?.period ?? '—'}`));
  lines.push('');
  lines.push(section('DESTINATION'));
  lines.push(kv('Destination', dest.name));
  lines.push(kv('Host', dest.host));
  lines.push(kv('Category', `${CATEGORY_LABEL[dest.category] ?? dest.category}${dest.enabled ? '' : ' · DISABLED'}`));
  if (dest.location) lines.push(kv('Location', dest.location));
  if (dest.region) lines.push(kv('Region', dest.region));
  if (dest.description) lines.push(kv('Description', dest.description));
  lines.push('');
  lines.push(section('REGISTRATION & ROUTING'));
  lines.push(kvPairs(['ASN', dest.asn ? `AS${dest.asn}` : '—'], ['Registry', (dest.registry || '—').toUpperCase()]));
  lines.push(kvPairs(['Company', dest.company || '—'], ['Country', dest.country || '—']));
  lines.push(kvPairs(['Resolved IP', dest.ipAddress || '—'], ['Prefix', dest.prefix || '—']));
  if (dest.enrichedAt) lines.push(kv('Attribution updated', fmtDate(dest.enrichedAt)));
  lines.push('');

  const o = periodReport?.overall;
  const uptime = o?.uptimePct;
  lines.push(section('NETWORK HEALTH · LAST 24 HOURS'));
  lines.push(kv('Reports', o ? `${o.reachable}/${o.reports} reachable` : '—'));
  if (uptime !== undefined) lines.push(kv('Uptime', `${bar(uptime / 100)} ${uptime.toFixed(1)}%`));
  lines.push(kv('Avg RTT', fmtRtt(o?.avgRtt ?? null)));
  lines.push(kv('Changes', String(o?.changes ?? '—')));
  if (pings.length > 0) {
    lines.push('');
    lines.push(kv('Latency · 5-min avg', `(${pings.length} samples)`));
    lines.push('  ' + sparkline(pings.map((p) => p.avgRtt)));
    const finite = pings.filter((p) => p.avgRtt !== null && p.avgRtt !== undefined).map((p) => p.avgRtt as number);
    if (finite.length > 0) {
      const min = Math.min(...finite);
      const max = Math.max(...finite);
      const avg = finite.reduce((a, b) => a + b, 0) / finite.length;
      lines.push(`  min ${fmtRtt(min)} · avg ${fmtRtt(avg)} · max ${fmtRtt(max)}`);
    }
  }
  lines.push('');

  const latest = reports[0];
  if (latest) {
    lines.push(section('LATEST TRACE REPORT'));
    lines.push(kv('Started', fmtDate(latest.startedAt)));
    lines.push(kv('Completed', fmtDate(latest.completedAt)));
    lines.push(kv('Duration', `${latest.durationMs} ms`));
    lines.push(kv('Trigger', latest.triggeredBy));
    lines.push(kv('Result', statusLabel(latest.reachable)));
    lines.push(kv('Ping', `sent ${latest.ping.packetsSent} · received ${latest.ping.packetsReceived} · loss ${latest.ping.lossPercent}%`));
    lines.push(
      kv('RTT', `min ${fmtRtt(latest.ping.minRtt)} · avg ${fmtRtt(latest.ping.avgRtt)} · max ${fmtRtt(latest.ping.maxRtt)}`)
    );
    if (latest.error) lines.push(kv('Error', latest.error));
    const path = latest.hops.map((h) => h.ip ?? '*').join(' ▸ ');
    lines.push(kv('Path', `${latest.hops.length} hops — ${path}`));
    lines.push(kv('AS path', asPath(latest.hops)));
    lines.push('');
    lines.push(section('NETWORK PATH · HOP-BY-HOP'));
    lines.push('');
    const rows = latest.hops.map((h) => [
      String(h.ttl),
      h.ip ?? '*',
      h.asn ? `AS${h.asn}` : '—',
      h.company || '—',
      fmtRtt(h.avgRtt),
    ]);
    if (rows.length === 0) {
      lines.push('  No hops captured (unreachable).');
    } else {
      lines.push(...boxTable(PATH_COLS, rows));
    }
    lines.push('');
  }

  if (reports.length > 0) {
    lines.push(section('RECENT TRACES'));
    lines.push('');
    lines.push(`  ${pad('#', 4)} ${pad('Time', 21)} ${pad('Status', 12)} ${pad('Avg RTT', 9, 'right')} ${pad('Loss', 6, 'right')} ${pad('Hops', 4, 'right')}`);
    lines.push(`  ${rep('─', 4)} ${rep('─', 21)} ${rep('─', 12)} ${rep('─', 9)} ${rep('─', 6)} ${rep('─', 4)}`);
    reports.slice(0, 10).forEach((r, i) => {
      lines.push(
        `  ${pad(String(i + 1), 4)} ${pad(fmtDate(r.startedAt), 21)} ${pad(statusLabel(r.reachable), 12)} ${pad(fmtRtt(r.ping.avgRtt), 9, 'right')} ${pad(`${r.ping.lossPercent}%`, 6, 'right')} ${pad(String(r.hops.length), 4, 'right')}`
      );
    });
    lines.push('');
  }

  if (events.length > 0) {
    lines.push(section('RECENT CHANGE EVENTS'));
    lines.push('');
    events.forEach((e) => {
      lines.push(`  ${SEV_ICON[e.severity] ?? '•'} [${pad(e.severity.toUpperCase(), 8)}] ${fmtDate(e.createdAt)}`);
      lines.push(`    ${e.summary}`);
    });
    lines.push('');
  }

  lines.push(rep('═', W));
  lines.push('  UPSTREAM MONITOR · AUTOMATIC NETWORK REPORT · ' + new Date().toLocaleString());
  lines.push(rep('═', W));
  return lines.join('\n');
}