import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../lib/api';
import type { ChangeEvent, Destination, PeriodReport, PingSample, ReportPeriod, TraceHop, TraceReport } from '../lib/types';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { CATEGORY_LABEL, fmtAgo, fmtDate, fmtRtt } from '../lib/format';
import { isAuthed } from '../lib/auth';

const PERIODS: ReportPeriod[] = ['daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'];

export default function DestinationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dest, setDest] = useState<Destination | null>(null);
  const [reports, setReports] = useState<TraceReport[]>([]);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [pings, setPings] = useState<PingSample[]>([]);
  const [period, setPeriod] = useState<ReportPeriod>('daily');
  const [periodReport, setPeriodReport] = useState<PeriodReport | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tracing, setTracing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const authed = isAuthed();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, r, e, p] = await Promise.all([
        api.getDestination(id),
        api.listReports({ destinationId: id, limit: 100 }),
        api.listChanges({ destinationId: id, limit: 10 }),
        api.listPings(id, 1000),
      ]);
      setDest(d);
      setReports(r.data);
      setEvents(e.data);
      setPings(p);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    api
      .periodReport(period, id)
      .then(setPeriodReport)
      .catch(() => setPeriodReport(null));
  }, [period, id]);

  async function traceNow() {
    if (!dest) return;
    setTracing(true);
    setError('');
    try {
      await api.runTrace(dest._id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTracing(false);
    }
  }

  async function deleteAllData() {
    if (!dest) return;
    if (!window.confirm(`Delete ALL trace reports, change events and ping samples for ${dest.name} (${dest.host})? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    setError('');
    try {
      await api.deleteDestinationData(dest._id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  function exportTraceText(report: TraceReport): string {
    const lines: string[] = [];
    lines.push(`Upstream Monitor — Network path export`);
    lines.push(`Destination: ${report.destName || report.destHost}`);
    lines.push(`Host: ${report.destHost}`);
    lines.push(`Trace time: ${fmtDate(report.startedAt)}`);
    lines.push(`Result: ${report.reachable ? 'reachable' : 'unreachable'}`);
    lines.push(
      `Ping: min=${fmtRtt(report.ping.minRtt)} max=${fmtRtt(report.ping.maxRtt)} avg=${fmtRtt(report.ping.avgRtt)} loss=${report.ping.lossPercent}%`
    );
    lines.push('');
    lines.push('TTL\tIP\tASN\tCompany\tAvg RTT');
    for (const h of report.hops) {
      lines.push(`${h.ttl}\t${h.ip ?? '*'}${h.host ? ` (${h.host})` : ''}\t${h.asn ? `AS${h.asn}` : '—'}\t${h.company || '—'}\t${fmtRtt(h.avgRtt)}`);
    }
    return lines.join('\n');
  }

  function downloadTrace(report: TraceReport) {
    const blob = new Blob([exportTraceText(report)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-${report.destHost}-${report.startedAt.slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner label="Loading destination…" />;

  if (error || !dest) {
    return <div className="card text-red-600 dark:text-red-300">{error || 'Destination not found.'}</div>;
  }

  const pingChart = pings.map((p) => ({
    time: new Date(p.sampledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    min: p.minRtt ?? null,
    max: p.maxRtt ?? null,
    avg: p.avgRtt ?? null,
  }));

  const periodChart = (periodReport?.series ?? []).map((s) => ({
    time: s.day,
    avgRtt: s.avgRtt ?? null,
    uptimePct: s.uptimePct,
  }));

  const latest = reports[0];
  const latestPing = pings.length > 0 ? pings[pings.length - 1] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-sm text-tx3 hover:text-accent">← Dashboard</Link>
            <span className="text-tx3">/</span>
            <h1 className="text-xl font-semibold text-tx">{dest.name}</h1>
            <Badge label={CATEGORY_LABEL[dest.category] ?? dest.category} tone={dest.category} />
          </div>
          <p className="mt-1 text-sm text-tx3">
            <span className="font-mono">{dest.host}</span>
            {dest.location ? ` · ${dest.location}` : ''}
            {dest.region ? ` · ${dest.region}` : ''}
          </p>
          {dest.description && <p className="mt-1 text-sm text-tx3">{dest.description}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {latest && (
            <div className="text-right">
              <span className={latest.reachable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                {latest.reachable ? 'Reachable' : 'Unreachable'}
              </span>
              <div className="text-xs text-tx3">{fmtAgo(latest.startedAt)}</div>
            </div>
          )}
          {authed && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button className="btn-primary" onClick={traceNow} disabled={tracing}>
                {tracing ? 'Tracing…' : 'Trace now'}
              </button>
              <button className="btn-ghost" onClick={() => navigate(`/destinations?edit=${dest._id}`)}>Edit destination</button>
              <button className="btn-ghost text-red-600 dark:text-red-400" onClick={deleteAllData} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete all data'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-tx3">ASN</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-tx">{dest.asn ? `AS${dest.asn}` : '—'}</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-tx3">Company</div>
          <div className="mt-1 text-lg font-semibold text-tx">{dest.company || '—'}</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-tx3">Registry</div>
          <div className="mt-1 font-mono text-lg font-semibold text-tx">{dest.registry?.toUpperCase() || '—'}</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-tx3">Country</div>
          <div className="mt-1 font-mono text-lg font-semibold text-tx">{dest.country || '—'}</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-tx3">Resolved IP</div>
          <div className="mt-1 font-mono text-lg font-semibold text-tx">{dest.ipAddress || '—'}</div>
          {latestPing && (
            <div className="mt-2 flex items-end gap-2">
              <div>
                <div className="text-[10px] uppercase text-tx3">min</div>
                <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{fmtRtt(latestPing.minRtt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-tx3">avg</div>
                <div className="font-mono text-2xl font-bold text-accent">{fmtRtt(latestPing.avgRtt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-tx3">max</div>
                <div className="font-mono text-xs text-amber-600 dark:text-amber-400">{fmtRtt(latestPing.maxRtt)}</div>
              </div>
            </div>
          )}
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-tx3">Prefix</div>
          <div className="mt-1 font-mono text-lg font-semibold text-tx">{dest.prefix || '—'}</div>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tx3">
            Latency history
          </h2>
          <div className="flex gap-1">
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
        </div>
        {periodChart.length === 0 ? (
          <p className="text-sm text-tx3">No data in this period yet.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={periodChart}>
                <defs>
                  <linearGradient id="perGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgb(var(--c-accent))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="rgb(var(--c-accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-edge))" />
                <XAxis dataKey="time" stroke="rgb(var(--c-tx3))" fontSize={11} tick={{ fill: 'rgb(var(--c-tx3))' }} />
                <YAxis yAxisId="rtt" stroke="rgb(var(--c-tx3))" fontSize={11} tick={{ fill: 'rgb(var(--c-tx3))' }} width={44} />
                <YAxis yAxisId="up" orientation="right" domain={[0, 100]} stroke="rgb(var(--c-tx3))" fontSize={11} tick={{ fill: 'rgb(var(--c-tx3))' }} width={36} />
                <Tooltip
                  contentStyle={{ background: 'rgb(var(--c-panel))', border: '1px solid rgb(var(--c-edge))', borderRadius: 8, color: 'rgb(var(--c-tx))' }}
                  labelStyle={{ color: 'rgb(var(--c-tx2))' }}
                />
                <Area yAxisId="rtt" type="monotone" dataKey="avgRtt" stroke="rgb(var(--c-accent))" strokeWidth={2} fill="url(#perGrad)" name="Avg RTT (ms)" connectNulls />
                <Line yAxisId="up" type="monotone" dataKey="uptimePct" stroke="#10b981" strokeWidth={2} dot={false} name="Uptime %" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tx3">
          Ping samples — {pings.length} (every 5 min)
        </h2>
        {pingChart.length === 0 ? (
          <p className="text-sm text-tx3">No ping samples yet — samples are recorded every 5 minutes.</p>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={pingChart}>
                <defs>
                  <linearGradient id="pingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgb(var(--c-accent))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="rgb(var(--c-accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-edge))" />
                <XAxis dataKey="time" stroke="rgb(var(--c-tx3))" fontSize={11} tick={{ fill: 'rgb(var(--c-tx3))' }} />
                <YAxis stroke="rgb(var(--c-tx3))" fontSize={11} tick={{ fill: 'rgb(var(--c-tx3))' }} width={44} />
                <Tooltip
                  contentStyle={{ background: 'rgb(var(--c-panel))', border: '1px solid rgb(var(--c-edge))', borderRadius: 8, color: 'rgb(var(--c-tx))' }}
                  labelStyle={{ color: 'rgb(var(--c-tx2))' }}
                />
                <Area type="monotone" dataKey="min" stroke="#10b981" strokeWidth={1.5} fill="none" name="min (ms)" connectNulls />
                <Line type="monotone" dataKey="avg" stroke="rgb(var(--c-accent))" strokeWidth={2} dot={false} name="avg (ms)" connectNulls />
                <Area type="monotone" dataKey="max" stroke="#f59e0b" strokeWidth={1.5} fill="none" name="max (ms)" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tx3">Recent changes</h2>
          {events.length === 0 ? (
            <p className="text-sm text-tx3">No change events for this destination.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e._id} className="rounded-lg border border-edge bg-ink/40 p-3">
                  <div className="flex items-center gap-2">
                    <Badge label={e.severity} tone={e.severity} />
                    <span className="text-xs text-tx3">{fmtDate(e.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-tx2">{e.summary}</p>
                  <ul className="mt-1 space-y-0.5">
                    {e.changes.map((c, i) => (
                      <li key={i} className="text-xs text-tx3">
                        <span className="font-mono text-tx3">[{c.type}]</span> {c.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-tx3">Network path — hop-by-hop</h2>
          </div>

          {reports.length === 0 ? (
            <p className="text-sm text-tx3">No trace reports yet.</p>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => {
                const expanded = expandedReportId === r._id;
                return (
                  <div key={r._id} className="overflow-hidden rounded-lg border border-edge bg-ink/40">
                    <button
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-edge/30"
                      onClick={() => setExpandedReportId(expanded ? null : r._id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${expanded ? 'rotate-90' : ''} transition-transform text-tx3`}>▶</span>
                        <span className="text-xs font-medium text-tx">{fmtDate(r.startedAt)}</span>
                        {r.reachable ? (
                          <Badge label="reachable" tone="good" />
                        ) : (
                          <Badge label="unreachable" tone="critical" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-tx3">
                        <span className="font-mono">avg {fmtRtt(r.ping.avgRtt)}</span>
                        <span>{r.ping.lossPercent}% loss</span>
                        <span>{r.hops.length} hops</span>
                        <span>{r.triggeredBy === 'manual' ? 'manual' : 'scheduled'}</span>
                        <button
                          className="btn-ghost !px-2 !py-0.5"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            downloadTrace(r);
                          }}
                          title="Download trace as text"
                        >
                          Export
                        </button>
                      </div>
                    </button>

                    {expanded && (
                      <div className="overflow-x-auto border-t border-edge">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-edge">
                              <th className="th">TTL</th>
                              <th className="th">IP</th>
                              <th className="th">ASN / Company</th>
                              <th className="th">Avg RTT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.hops.length === 0 ? (
                              <tr>
                                <td className="td text-tx3" colSpan={4}>No hops captured (unreachable).</td>
                              </tr>
                            ) : (
                              r.hops.map((h: TraceHop) => (
                                <tr key={h.ttl} className="border-b border-edge/40">
                                  <td className="td font-mono">{h.ttl}</td>
                                  <td className="td font-mono text-xs">{h.ip ?? '—'}</td>
                                  <td className="td font-mono text-xs">
                                    {h.asn ? `AS${h.asn}` : '—'}
                                    {h.company ? ` · ${h.company}` : ''}
                                  </td>
                                  <td className="td font-mono">{fmtRtt(h.avgRtt)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
