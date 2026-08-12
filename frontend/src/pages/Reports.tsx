import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../lib/api';
import type { Destination, PeriodReport, ReportCompare, ReportPeriod, TraceReport } from '../lib/types';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import StatCard from '../components/StatCard';
import { fmtDate, fmtRtt, periodTick } from '../lib/format';

const PERIODS: ReportPeriod[] = ['daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'];

export default function Reports() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'summary' | 'raw'>('summary');
  const [dests, setDests] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState(searchParams.get('destination') || '');
  const [period, setPeriod] = useState<ReportPeriod>('weekly');
  const [report, setReport] = useState<PeriodReport | null>(null);

  const [reports, setReports] = useState<TraceReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<TraceReport | null>(null);
  const [compare, setCompare] = useState<ReportCompare | null>(null);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const loadDests = useCallback(async () => {
    setDests(await api.listDestinations());
  }, []);

  const loadPeriod = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.periodReport(period, destinationId || undefined);
      setReport(r);
    } finally {
      setLoading(false);
    }
  }, [period, destinationId]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listReports({ destinationId: destinationId || undefined, page, limit });
      setReports(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [destinationId, page]);

  useEffect(() => {
    loadDests();
  }, [loadDests]);

  useEffect(() => {
    if (tab === 'summary') loadPeriod();
    else loadReports();
  }, [tab, loadPeriod, loadReports]);

  const pages = Math.max(1, Math.ceil(total / limit));
  const overall = report?.overall;

  async function openDetail(r: TraceReport) {
    setDetail(r);
    setCompare(null);
    try {
      setCompare(await api.compareReport(r._id));
    } catch {
      setCompare(null);
    }
  }

  const HOP_CHANGE_LABEL: Record<string, string> = {
    hop_added: 'New hop',
    hop_removed: 'Hop gone',
    hop_ip_change: 'IP changed',
    hop_rtt: 'RTT shifted',
    same: 'Same',
    none: 'ΓÇö',
  };

  function hopTone(change: string): string {
    switch (change) {
      case 'hop_added':
      case 'hop_removed':
      case 'hop_ip_change':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
      case 'hop_rtt':
        return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
      default:
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-tx">Reports</h1>
          <p className="text-sm text-tx3">Period availability & latency summaries, or raw trace reports.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-56" value={destinationId} onChange={(e) => { setDestinationId(e.target.value); setPage(1); }}>
            <option value="">All destinations</option>
            {dests.map((d) => (
              <option key={d._id} value={d._id}>{d.name} ({d.host})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {(['summary', 'raw'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-accent text-white' : 'text-tx2 hover:bg-edge/60'
            }`}
          >
            {t === 'summary' ? 'Summary' : 'Raw reports'}
          </button>
        ))}
        {tab === 'summary' && (
          <div className="ml-2 flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === p ? 'bg-accent text-white' : 'text-tx2 hover:bg-edge/60'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'summary' ? (
        loading || !report ? (
          <Spinner label="Loading period reportΓÇª" />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Uptime" value={overall ? `${overall.uptimePct}%` : 'ΓÇö'} sub="in period" tone={overall && overall.uptimePct < 99 ? 'warn' : 'good'} />
              <StatCard label="Avg RTT" value={fmtRtt(overall?.avgRtt ?? null)} sub="overall average" />
              <StatCard label="Reports" value={overall?.reports ?? 0} sub={`${overall?.reachable ?? 0} reachable`} />
              <StatCard label="Change events" value={overall?.changes ?? 0} sub="detected in period" tone={overall && overall.changes ? 'warn' : 'default'} />
            </div>

            <div className="card">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tx3">
                Network health ΓÇö {period}
              </h2>
              {report.series.length === 0 ? (
                <p className="text-sm text-tx3">No data in this period yet.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={report.series.map((s) => ({
                        day: s.day,
                        avgRtt: s.avgRtt ?? null,
                        uptimePct: s.uptimePct,
                      }))}
                    >
                      <defs>
                        <linearGradient id="prGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="rgb(var(--c-accent))" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="rgb(var(--c-accent))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-edge))" />
                      <XAxis dataKey="day" stroke="rgb(var(--c-tx3))" fontSize={11} tick={{ fill: 'rgb(var(--c-tx3))' }} tickFormatter={(v) => periodTick(period, v)} />
                      <YAxis yAxisId="rtt" stroke="rgb(var(--c-tx3))" fontSize={11} tick={{ fill: 'rgb(var(--c-tx3))' }} width={44} />
                      <YAxis yAxisId="up" orientation="right" domain={[0, 100]} stroke="rgb(var(--c-tx3))" fontSize={11} tick={{ fill: 'rgb(var(--c-tx3))' }} width={36} />
                      <Tooltip
                        contentStyle={{ background: 'rgb(var(--c-panel))', border: '1px solid rgb(var(--c-edge))', borderRadius: 8, color: 'rgb(var(--c-tx))' }}
                        labelStyle={{ color: 'rgb(var(--c-tx2))' }}
                      />
                      <Area yAxisId="rtt" type="monotone" dataKey="avgRtt" stroke="rgb(var(--c-accent))" strokeWidth={2} fill="url(#prGrad)" name="Avg RTT (ms)" connectNulls />
                      <Line yAxisId="up" type="monotone" dataKey="uptimePct" stroke="#10b981" strokeWidth={2} dot={false} name="Uptime %" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tx3">
                Destinations ΓÇö {period} ({report.destinations.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-edge">
                      <th className="th">Destination</th>
                      <th className="th">ASN / Company</th>
                      <th className="th">Uptime</th>
                      <th className="th">Avg RTT</th>
                      <th className="th">Reports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.destinations.length === 0 && (
                      <tr><td className="td" colSpan={5}>No destinations matched in this period.</td></tr>
                    )}
                    {report.destinations.map((d) => (
                      <tr key={d.destinationId} className="border-b border-edge/50 hover:bg-edge/30">
                        <td className="td font-medium">
                          <Link to={`/destination/${d.destinationId}`} className="hover:text-accent">
                            {d.name}
                          </Link>
                          <div className="font-mono text-xs text-tx3">{d.host}</div>
                        </td>
                        <td className="td">
                          <span className="font-mono text-xs">{d.asn ? `AS${d.asn}` : 'ΓÇö'}</span>
                          <div className="max-w-[200px] truncate text-xs text-tx3">{d.company || ''}</div>
                        </td>
                        <td className="td">
                          <span className={d.uptimePct < 99 ? 'font-mono text-amber-600 dark:text-amber-400' : 'font-mono text-emerald-600 dark:text-emerald-400'}>
                            {d.uptimePct}%
                          </span>
                        </td>
                        <td className="td font-mono">{fmtRtt(d.avgRtt)}</td>
                        <td className="td font-mono">{d.reports}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      ) : loading ? (
        <Spinner label="Loading reportsΓÇª" />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-edge">
                  <th className="th">Time</th>
                  <th className="th">Destination</th>
                  <th className="th">ASN</th>
                  <th className="th">Status</th>
                  <th className="th">Avg RTT</th>
                  <th className="th">Min/Max</th>
                  <th className="th">Loss</th>
                  <th className="th">Hops</th>
                  <th className="th">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 && (
                  <tr><td className="td" colSpan={9}>No reports found.</td></tr>
                )}
                {reports.map((r) => (
                  <tr key={r._id} className="cursor-pointer border-b border-edge/50 hover:bg-edge/30" onClick={() => openDetail(r)}>
                    <td className="td font-mono text-xs">{fmtDate(r.startedAt)}</td>
                    <td className="td">
                      <span className="font-medium">{r.destName || r.destHost}</span>
                      <div className="font-mono text-xs text-tx3">{r.destHost}</div>
                    </td>
                    <td className="td font-mono text-xs">{r.asn ? `AS${r.asn}` : 'ΓÇö'}</td>
                    <td className="td">
                      {r.reachable ? <Badge label="reachable" tone="good" /> : <Badge label="unreachable" tone="critical" />}
                    </td>
                    <td className="td font-mono">{fmtRtt(r.ping.avgRtt)}</td>
                    <td className="td font-mono text-xs">{fmtRtt(r.ping.minRtt)} / {fmtRtt(r.ping.maxRtt)}</td>
                    <td className="td font-mono">{r.ping.lossPercent}%</td>
                    <td className="td font-mono">{r.hops.length}</td>
                    <td className="td">
                      <Badge label={r.triggeredBy} tone={r.triggeredBy === 'scheduler' ? 'info' : 'warning'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-tx3">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
          <div className="card w-full max-w-3xl my-8">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-tx">
                  {detail.destName || detail.destHost}{' '}
                  <span className="font-mono text-sm text-tx3">({detail.destHost})</span>
                </h2>
                <p className="text-xs text-tx3">
                  {fmtDate(detail.startedAt)} ┬╖ {detail.durationMs}ms ┬╖ trigger {detail.triggeredBy}
                </p>
              </div>
              <button className="btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div className="rounded-lg bg-ink p-3">
                <div className="text-xs text-tx3">Status</div>
                <div className={detail.reachable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                  {detail.reachable ? 'Reachable' : 'Unreachable'}
                </div>
              </div>
              <div className="rounded-lg bg-ink p-3">
                <div className="text-xs text-tx3">Avg RTT</div>
                <div className="font-mono text-tx">{fmtRtt(detail.ping.avgRtt)}</div>
              </div>
              <div className="rounded-lg bg-ink p-3">
                <div className="text-xs text-tx3">Packet loss</div>
                <div className="font-mono text-tx">{detail.ping.lossPercent}%</div>
              </div>
              <div className="rounded-lg bg-ink p-3">
                <div className="text-xs text-tx3">Hops</div>
                <div className="font-mono text-tx">{detail.hops.length}</div>
              </div>
            </div>

            <div className="mb-4 rounded-lg bg-ink p-3 text-xs text-tx3">
              <span className="font-medium text-tx2">Destination:</span>{' '}
              {detail.asn ? <span className="font-mono">AS{detail.asn}</span> : 'ΓÇö'}
              {detail.company ? ` ┬╖ ${detail.company}` : ''}
            </div>

            <h3 className="mb-2 text-sm font-semibold text-tx3">Path ΓÇö hop-by-hop vs previous report</h3>
            <div className="overflow-x-auto rounded-lg bg-ink">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="th">TTL</th>
                    <th className="th">Change</th>
                    <th className="th">Previous IP</th>
                    <th className="th">Current IP</th>
                    <th className="th">ASN / Company</th>
                    <th className="th">Prev RTT</th>
                    <th className="th">Curr RTT</th>
                  </tr>
                </thead>
                <tbody>
                  {compare?.diff?.length ? (
                    compare.diff.map((d) => (
                      <tr
                        key={d.ttl}
                        className={`border-b border-edge/40 ${
                          d.change === 'same' ? '' : 'bg-amber-500/5'
                        }`}
                      >
                        <td className="td font-mono">{d.ttl}</td>
                        <td className="td">
                          <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${hopTone(d.change)}`}>
                            {HOP_CHANGE_LABEL[d.change] ?? d.change}
                          </span>
                        </td>
                        <td className={`td font-mono text-xs ${d.change === 'hop_added' ? 'text-tx3' : ''}`}>
                          {d.prevIp ?? 'ΓÇö'}
                          {d.prevIp && d.prevIp !== d.currIp && (
                            <div className="font-mono text-[10px] text-tx3">
                              {d.prevAsn ? `AS${d.prevAsn}` : ''} {d.prevCompany || ''}
                            </div>
                          )}
                        </td>
                        <td className={`td font-mono text-xs ${d.change === 'hop_removed' ? 'text-tx3' : ''}`}>
                          {d.currIp ?? 'ΓÇö'}
                          <div className="font-mono text-[10px] text-tx3">
                            {d.currAsn ? `AS${d.currAsn}` : ''} {d.currCompany || ''}
                          </div>
                        </td>
                        <td className="td font-mono text-xs">
                          {d.change === 'hop_ip_change' ? (
                            <span className="text-amber-600 dark:text-amber-300">
                              {d.currAsn ? `AS${d.currAsn}` : 'ΓÇö'} ┬╖ {d.currCompany || 'unknown'}
                            </span>
                          ) : d.currAsn ? (
                            <span>{`AS${d.currAsn}`} ┬╖ {d.currCompany || 'ΓÇö'}</span>
                          ) : (
                            'ΓÇö'
                          )}
                        </td>
                        <td className="td font-mono text-xs">{fmtRtt(d.prevRtt)}</td>
                        <td className="td font-mono">{fmtRtt(d.currRtt)}</td>
                      </tr>
                    ))
                  ) : (
                    detail.hops.map((h) => (
                      <tr key={h.ttl} className="border-b border-edge/40">
                        <td className="td font-mono">{h.ttl}</td>
                        <td className="td">ΓÇö</td>
                        <td className="td font-mono text-xs">ΓÇö</td>
                        <td className="td font-mono text-xs">{h.ip ?? 'ΓÇö'}</td>
                        <td className="td font-mono text-xs">
                          {h.asn ? `AS${h.asn}` : 'ΓÇö'}
                          {h.company ? ` ┬╖ ${h.company}` : ''}
                        </td>
                        <td className="td font-mono text-xs">ΓÇö</td>
                        <td className="td font-mono">{fmtRtt(h.avgRtt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!compare?.hasPrevious && compare && (
              <p className="mt-2 text-xs text-tx3">
                No previous report to compare against yet ΓÇö run a second trace to see hop-by-hop changes.
              </p>
            )}

            {detail.pathFingerprint && (
              <p className="mt-3 break-all font-mono text-xs text-tx3">Path: {detail.pathFingerprint}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
