import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../lib/api';
import type { Stats, TraceReport, TrendPoint } from '../lib/types';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { fmtAgo, fmtRtt } from '../lib/format';

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [latest, setLatest] = useState<TraceReport[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [s, l, t] = await Promise.all([api.stats(), api.latestReports(), api.statsTrend(24)]);
      setStats(s);
      setLatest(l);
      setTrend(t);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  if (error && !stats) {
    return (
      <div className="card border-red-500/40 text-red-600 dark:text-red-300">
        Failed to reach the API: {error}. Is the backend running?
      </div>
    );
  }

  if (!stats) return <Spinner label="Loading dashboard…" />;

  const chartData = trend.map((p) => ({
    time: new Date(p.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    avgRtt: p.avgRtt ?? null,
    uptimePct: p.uptimePct,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-tx">Dashboard</h1>
          <p className="text-sm text-tx3">
            Last scheduled run: {stats.lastScheduledRunAt ? fmtAgo(stats.lastScheduledRunAt) : 'never'} ·{' '}
            {stats.tracingRunning ? (
              <span className="text-amber-600 dark:text-amber-400">trace in progress…</span>
            ) : (
              'idle'
            )}
          </p>
        </div>
        <button className="btn-primary" onClick={() => api.runTrace()} disabled={stats.tracingRunning}>
          {stats.tracingRunning ? 'Tracing…' : 'Run full trace now'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Destinations" value={stats.enabledDestinations} sub={`${stats.destinations} total`} />
        <StatCard label="Reachable" value={stats.recovery.reachable} sub="from latest reports" tone="good" />
        <StatCard label="Unreachable" value={stats.recovery.unreachable} sub="from latest reports" tone={stats.recovery.unreachable ? 'bad' : 'default'} />
        <StatCard
          label="Uptime (24h)"
          value={stats.uptime24h === null ? '—' : `${stats.uptime24h}%`}
          sub="across all destinations"
          tone={stats.uptime24h !== null && stats.uptime24h < 99 ? 'warn' : 'good'}
        />
        <StatCard
          label="Avg RTT (24h)"
          value={fmtRtt(stats.avgRtt24h)}
          sub="overall average"
        />
        <StatCard
          label="Unacked changes"
          value={stats.unacknowledgedChanges}
          sub={`${stats.criticalChanges} critical`}
          tone={stats.unacknowledgedChanges ? 'warn' : 'default'}
        />
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tx3">
            Network health — last 24 hours
          </h2>
          <span className="text-xs text-tx3">
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-accent" /> avg RTT
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> uptime
            </span>
          </span>
        </div>
        {chartData.length === 0 ? (
          <p className="text-sm text-tx3">
            Not enough data yet — run a trace or wait for the hourly schedule.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="rttGrad" x1="0" y1="0" x2="0" y2="1">
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
                <Area yAxisId="rtt" type="monotone" dataKey="avgRtt" stroke="rgb(var(--c-accent))" strokeWidth={2} fill="url(#rttGrad)" name="Avg RTT (ms)" connectNulls />
                <Line yAxisId="up" type="monotone" dataKey="uptimePct" stroke="#10b981" strokeWidth={2} dot={false} name="Uptime %" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tx3">
          Latest per-destination status
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-edge">
                <th className="th">Destination</th>
                <th className="th">ASN / Company</th>
                <th className="th">Status</th>
                <th className="th">Avg RTT</th>
                <th className="th">Loss</th>
                <th className="th">Hops</th>
                <th className="th">Ran</th>
              </tr>
            </thead>
            <tbody>
              {latest.length === 0 && (
                <tr>
                  <td className="td" colSpan={7}>
                    No reports yet — run a trace or wait for the hourly schedule.
                  </td>
                </tr>
              )}
              {latest.map((r) => (
                <tr key={r._id} className="border-b border-edge/50 hover:bg-edge/30">
                  <td className="td font-medium">
                    <Link to={`/destination/${r.destinationId}`} className="hover:text-accent">
                      {r.destName || r.destHost}
                    </Link>
                    <div className="font-mono text-xs text-tx3">{r.destHost}</div>
                  </td>
                  <td className="td">
                    <span className="font-mono text-xs">{r.asn ? `AS${r.asn}` : '—'}</span>
                    <div className="max-w-[220px] truncate text-xs text-tx3">{r.company || ''}</div>
                  </td>
                  <td className="td">
                    {r.reachable ? (
                      <Badge label="reachable" tone="good" />
                    ) : (
                      <Badge label="unreachable" tone="critical" />
                    )}
                  </td>
                  <td className="td font-mono">{fmtRtt(r.ping.avgRtt)}</td>
                  <td className="td font-mono">{r.ping.lossPercent}%</td>
                  <td className="td font-mono">{r.hops.length}</td>
                  <td className="td">{fmtAgo(r.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
