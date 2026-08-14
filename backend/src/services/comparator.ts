import { getSettingNumber } from './settings';
import type { ChangeDetail, ChangeSeverity } from '../models/ChangeEvent';
import type { TraceHop, TraceReportDoc } from '../models/TraceReport';

export interface ComparisonResult {
  severity: ChangeSeverity;
  summary: string;
  changes: ChangeDetail[];
}

/** One row of a hop-by-hop "previous vs current" comparison. */
export interface HopDiff {
  ttl: number;
  change: 'same' | 'hop_added' | 'hop_removed' | 'hop_ip_change' | 'hop_as_change' | 'hop_rtt' | 'none';
  prevIp: string | null;
  currIp: string | null;
  prevRtt: number | null;
  currRtt: number | null;
  prevAsn: number | null;
  currAsn: number | null;
  prevCompany: string;
  currCompany: string;
}

/**
 * Builds a hop-by-hop diff of two reports for the same destination.
 * Rows are keyed by TTL; `change` reflects what, if anything, differs.
 */
export function buildHopDiff(prev: { hops: TraceHop[] }, curr: { hops: TraceHop[] }): HopDiff[] {
  const prevHops = prev.hops ?? [];
  const currHops = curr.hops ?? [];
  const prevByTtl = new Map<number, TraceHop>(prevHops.map((h) => [h.ttl, h]));
  const currByTtl = new Map<number, TraceHop>(currHops.map((h) => [h.ttl, h]));
  const allTtls = Array.from(new Set([...prevByTtl.keys(), ...currByTtl.keys()])).sort((a, b) => a - b);

  return allTtls.map((ttl) => {
    const p = prevByTtl.get(ttl);
    const c = currByTtl.get(ttl);

    const row: HopDiff = {
      ttl,
      change: 'same',
      prevIp: p?.ip ?? null,
      currIp: c?.ip ?? null,
      prevRtt: p?.avgRtt ?? null,
      currRtt: c?.avgRtt ?? null,
      prevAsn: p?.asn ?? null,
      currAsn: c?.asn ?? null,
      prevCompany: p?.company ?? '',
      currCompany: c?.company ?? '',
    };

    if (!p && c) row.change = 'hop_added';
    else if (p && !c) row.change = 'hop_removed';
    else if (p && c) {
      // AS-path change is the most vital signal (a company may run multiple
      // routers / peers for the same job) so it takes priority over an IP
      // change. Only flag it when the SAME hop's ASN changed vs the previous
      // trace AND both ASNs are known — an intra-trace AS transition (packets
      // hopping A->B->C at different TTLs) is normal and not a route change.
      const asChanged = p.asn !== null && c.asn !== null && p.asn !== c.asn;
      if (asChanged) {
        row.change = 'hop_as_change';
      } else if (p.ip !== c.ip) {
        row.change = 'hop_ip_change';
      } else {
        const pct = rttDeltaPct(p.avgRtt, c.avgRtt);
        const abs = Math.abs((c.avgRtt ?? 0) - (p.avgRtt ?? 0));
        if (rttChanged(pct, abs)) {
          row.change = 'hop_rtt';
        }
      }
    }

    return row;
  });
}

function rttDeltaPct(a: number | null, b: number | null): number | null {
  if (a === null || b === null || a === 0) return null;
  return Math.round(((b - a) / a) * 1000) / 10;
}

/** Whether an RTT shift crosses the configured % and absolute-ms thresholds. */
function rttChanged(pct: number | null, abs: number): boolean {
  if (pct === null) return false;
  const thresholdPct = getSettingNumber('rttChangePercentThreshold', 30);
  const thresholdMs = getSettingNumber('rttChangeAbsThresholdMs', 15);
  return pct >= thresholdPct && abs >= thresholdMs;
}

function fmtRtt(v: number | null): string {
  return v === null ? 'n/a' : `${Math.round(v)}ms`;
}

/**
 * Compares the latest trace report against a previous one for the same
 * destination and returns a structured list of changes plus a severity level.
 */
export function compareReports(
  prev: TraceReportDoc,
  curr: TraceReportDoc
): ComparisonResult {
  const changes: ChangeDetail[] = [];

  /* 1. Reachability */
  if (prev.reachable && !curr.reachable) {
    changes.push({
      type: 'reachability',
      field: 'reachable',
      oldValue: true,
      newValue: false,
      message: `${curr.destHost} became UNREACHABLE (was reachable in the previous report)`,
    });
  } else if (!prev.reachable && curr.reachable) {
    changes.push({
      type: 'reachability',
      field: 'reachable',
      oldValue: false,
      newValue: true,
      message: `${curr.destHost} recovered and is reachable again`,
    });
  }

  /* 2. Packet loss */
  if (prev.ping.lossPercent !== curr.ping.lossPercent) {
    const lossDelta = curr.ping.lossPercent - prev.ping.lossPercent;
    if (Math.abs(lossDelta) > 0.5) {
      changes.push({
        type: 'packet_loss',
        field: 'lossPercent',
        oldValue: prev.ping.lossPercent,
        newValue: curr.ping.lossPercent,
        message: `Packet loss changed from ${prev.ping.lossPercent}% to ${curr.ping.lossPercent}%`,
      });
    }
  }

  /* 3. Round-trip time shift */
  if (prev.ping.avgRtt !== null && curr.ping.avgRtt !== null) {
    const pct = rttDeltaPct(prev.ping.avgRtt, curr.ping.avgRtt);
    const abs = Math.abs(curr.ping.avgRtt - prev.ping.avgRtt);
    if (pct !== null && rttChanged(pct, abs)) {
      changes.push({
        type: 'rtt',
        field: 'avgRtt',
        oldValue: prev.ping.avgRtt,
        newValue: curr.ping.avgRtt,
        message: `Average RTT shifted by ${pct >= 0 ? '+' : ''}${pct}% (${fmtRtt(prev.ping.avgRtt)} -> ${fmtRtt(curr.ping.avgRtt)})`,
      });
    }
  }

  /* 4. Path fingerprint (hop IP sequence) */
  if (prev.pathFingerprint && curr.pathFingerprint && prev.pathFingerprint !== curr.pathFingerprint) {
    changes.push({
      type: 'path',
      field: 'pathFingerprint',
      oldValue: prev.pathFingerprint,
      newValue: curr.pathFingerprint,
      message: 'Network path changed between reports',
    });
  }

  /* 5. Per-hop comparison */
  const prevHops = prev.hops as unknown as TraceHop[];
  const currHops = curr.hops as unknown as TraceHop[];
  const prevByTtl = new Map<number, TraceHop>(prevHops.map((h) => [h.ttl, h]));
  const currByTtl = new Map<number, TraceHop>(currHops.map((h) => [h.ttl, h]));
  const allTtls = new Set([...prevByTtl.keys(), ...currByTtl.keys()]);

  for (const ttl of allTtls) {
    const p = prevByTtl.get(ttl);
    const c = currByTtl.get(ttl);

    if (!p) {
      changes.push({
        type: 'hop_added',
        hopTtl: ttl,
        oldValue: null,
        newValue: c?.ip ?? null,
        message: `New hop appeared at TTL ${ttl} (${c?.ip ?? 'no IP'})`,
      });
      continue;
    }
    if (!c) {
      changes.push({
        type: 'hop_removed',
        hopTtl: ttl,
        oldValue: p.ip ?? null,
        newValue: null,
        message: `Hop at TTL ${ttl} (${p.ip ?? 'no IP'}) disappeared from the path`,
      });
      continue;
    }

    // AS-path change is the most vital signal — a company may run multiple
    // routers or peers for the same job. Only flag it when the SAME hop's ASN
    // changed vs the previous trace AND both ASNs are known. Packets normally
    // crossing from one AS to another across different hops is not a change.
    if (p.asn !== null && c.asn !== null && p.asn !== c.asn) {
      changes.push({
        type: 'hop_as_change',
        hopTtl: ttl,
        oldValue: p.asn,
        newValue: c.asn,
        message: `AS path changed at TTL ${ttl}: ${p.asn ? `AS${p.asn}` : 'unknown'} (${p.company || 'n/a'}) -> ${c.asn ? `AS${c.asn}` : 'unknown'} (${c.company || 'n/a'})`,
      });
    }

    if (p.ip !== c.ip) {
      changes.push({
        type: 'hop_ip_change',
        hopTtl: ttl,
        oldValue: p.ip ?? null,
        newValue: c.ip ?? null,
        message: `Hop at TTL ${ttl} changed from ${p.ip ?? 'unresponsive'} to ${c.ip ?? 'unresponsive'}`,
      });
    }

    if (p.avgRtt !== null && c.avgRtt !== null) {
      const pct = rttDeltaPct(p.avgRtt, c.avgRtt);
      const abs = Math.abs(c.avgRtt - p.avgRtt);
      if (pct !== null && rttChanged(pct, abs)) {
        changes.push({
          type: 'hop_rtt',
          hopTtl: ttl,
          oldValue: p.avgRtt,
          newValue: c.avgRtt,
          message: `RTT at TTL ${ttl} shifted ${pct >= 0 ? '+' : ''}${pct}% (${fmtRtt(p.avgRtt)} -> ${fmtRtt(c.avgRtt)})`,
        });
      }
    }
  }

  /* 6. Hop count change */
  if (prevHops.length !== currHops.length) {
    changes.push({
      type: 'hop_count',
      field: 'hopCount',
      oldValue: prevHops.length,
      newValue: currHops.length,
      message: `Hop count changed from ${prevHops.length} to ${currHops.length}`,
    });
  }

  /* Deduplicate overlapping hop_count + hop_added/removed noise */
  const unique = changes.filter(
    (c, i) => changes.findIndex((x) => x.type === c.type && x.hopTtl === c.hopTtl && x.field === c.field) === i
  );

  const critical = unique.some(
    (c) => c.type === 'reachability' || c.type === 'packet_loss' || c.type === 'hop_as_change'
  );
  const warning =
    unique.some(
      (c) =>
        c.type === 'path' ||
        c.type === 'hop_ip_change' ||
        c.type === 'hop_added' ||
        c.type === 'hop_removed'
    ) ||
    unique.some((c) => {
      if (c.type !== 'rtt' && c.type !== 'hop_rtt') return false;
      const o = Number(c.oldValue);
      const n = Number(c.newValue);
      if (!Number.isFinite(o) || o === 0 || !Number.isFinite(n)) return false;
      return Math.abs((n - o) / o) >= 1;
    });
  const severity: ChangeSeverity = critical ? 'critical' : warning ? 'warning' : 'info';

  const summary =
    unique.length === 0
      ? `No significant changes detected for ${curr.destHost}`
      : `${unique.length} change${unique.length > 1 ? 's' : ''} detected for ${curr.destHost}`;

  return { severity, summary, changes: unique };
}
