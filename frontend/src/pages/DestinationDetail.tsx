import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../lib/api';
import type { ChangeEvent, Destination, ReportCompare, TraceHop, TraceReport } from '../lib/types';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { CATEGORY_LABEL, fmtAgo, fmtDate, fmtRtt } from '../lib/format';

const HOP_CHANGE_LABEL: Record<string, string> = {
  hop_added: 'New hop',
  hop_removed: 'Hop gone',
  hop_ip_change: 'IP changed',
  hop_rtt: 'RTT shifted',
  same: 'Same',
  none: '—',
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

export default function DestinationDetail() {
  const { id } = useParams<{ id: string }>();
  const [dest, setDest] = useState<Destination | null>(null);
  const [reports, setReports] = useState<TraceReport[]>([]);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [compare, setCompare] = useState<ReportCompare | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, r, e] = await Promise.all([
        api.getDestination(id),
        api.listReports({ destinationId: id, limit: 24 }),
        api.listChanges({ destinationId: id, limit: 10 }),
      ]);
      setDest(d);
      setReports(r.data);
      setEvents(e.data);
      if (r.data.length > 0 && !selectedReportId) setSelectedReportId(r.data[0]._id);
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
    if (!selectedReportId) return;
    setCompareLoading(true);
    api
      .compareReport(selectedReportId)
      .then(setCompare)
      .catch(() => setCompare(null))
      .finally(() => setCompareLoading(false));
  }, [selectedReportId]);

  if (loading) return <Spinner label="Loading destination…" />;

  if (error || !dest) {
    return <div className="card text-red-600 dark:text-red-300">{error || 'Destination not found.'}</div>;
  }

  const chart = reports
    .slice()
    .reverse()
    .map((r) => ({
      time: new Date(r.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      avgRtt: r.ping.avgRtt ?? null,
    }));

  const latest = reports[0];

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
        {latest && (
          <div className="text-right">
            <span className={latest.reachable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              {latest.reachable ? 'Reachable' : 'Unreachable'}
            </span>
            <div className="text-xs text-tx3">{fmtAgo(latest.startedAt)}</div>
          </div>
        )}
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
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-tx3">Prefix</div>
          <div className="mt-1 font-mono text-lg font-semibold text-tx">{dest.prefix || '—'}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tx3">RTT history — last 24 reports</h2>
        {chart.length === 0 ? (
          <p className="text-sm text-tx3">No trace reports yet.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="destGrad" x1="0" y1="0" x2="0" y2="1">
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
                <Area type="monotone" dataKey="avgRtt" stroke="rgb(var(--c-accent))" strokeWidth={2} fill="url(#destGrad)" name="Avg RTT (ms)" connectNulls />
              </AreaChart>
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
            {reports.length > 0 && (
              <select
                className="input w-64"
                value={selectedReportId}
                onChange={(e) => setSelectedReportId(e.target.value)}
              >
                {reports.map((r) => (
                  <option key={r._id} value={r._id}>{fmtDate(r.startedAt)} — {r.reachable ? 'reachable' : 'unreachable'} ({fmtRtt(r.ping.avgRtt)})</option>
                ))}
              </select>
            )}
          </div>

          {reports.length === 0 ? (
            <p className="text-sm text-tx3">No trace reports yet.</p>
          ) : compareLoading ? (
            <Spinner label="Loading path…" />
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
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
                          className={`border-b border-edge/40 ${d.change === 'same' ? '' : 'bg-amber-500/5'}`}
                        >
                          <td className="td font-mono">{d.ttl}</td>
                          <td className="td">
                            <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${hopTone(d.change)}`}>
                              {HOP_CHANGE_LABEL[d.change] ?? d.change}
                            </span>
                          </td>
                          <td className={`td font-mono text-xs ${d.change === 'hop_added' ? 'text-tx3' : ''}`}>
                            {d.prevIp ?? '—'}
                            {d.prevIp && d.prevIp !== d.currIp && (
                              <div className="font-mono text-[10px] text-tx3">
                                {d.prevAsn ? `AS${d.prevAsn}` : ''} {d.prevCompany || ''}
                              </div>
                            )}
                          </td>
                          <td className={`td font-mono text-xs ${d.change === 'hop_removed' ? 'text-tx3' : ''}`}>
                            {d.currIp ?? '—'}
                            <div className="font-mono text-[10px] text-tx3">
                              {d.currAsn ? `AS${d.currAsn}` : ''} {d.currCompany || ''}
                            </div>
                          </td>
                          <td className="td font-mono text-xs">
                            {d.currAsn ? `AS${d.currAsn}` : '—'}
                            {d.currCompany ? ` · ${d.currCompany}` : ''}
                          </td>
                          <td className="td font-mono text-xs">{fmtRtt(d.prevRtt)}</td>
                          <td className="td font-mono">{fmtRtt(d.currRtt)}</td>
                        </tr>
                      ))
                    ) : (
                      (compare?.current?.hops as TraceHop[] | undefined ?? []).map((h) => (
                        <tr key={h.ttl} className="border-b border-edge/40">
                          <td className="td font-mono">{h.ttl}</td>
                          <td className="td">—</td>
                          <td className="td font-mono text-xs">—</td>
                          <td className="td font-mono text-xs">{h.ip ?? '—'}</td>
                          <td className="td font-mono text-xs">
                            {h.asn ? `AS${h.asn}` : '—'}
                            {h.company ? ` · ${h.company}` : ''}
                          </td>
                          <td className="td font-mono text-xs">—</td>
                          <td className="td font-mono">{fmtRtt(h.avgRtt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {compare && !compare.hasPrevious && (
                <p className="text-xs text-tx3">
                  No previous report to compare against — run a second trace to see hop-by-hop changes.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
