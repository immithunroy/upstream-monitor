import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../lib/api';
import type { PeriodReport, ReportPeriod, Stats, TraceReport } from '../lib/types';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { fmtAgo, fmtRtt, periodTick } from '../lib/format';

const PERIODS: ReportPeriod[] = ['daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'];

type SortKey = 'name' | 'asn' | 'avgRtt' | 'loss' | 'hops' | 'ran';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return <span className={`ml-1 text-[10px] ${active ? 'text-accent' : 'text-tx3 opacity-40'}`}>{dir === 'asc' ? '▲' : '▼'}</span>;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [latest, setLatest] = useState<TraceReport[]>([]);
  const [period, setPeriod] = useState<ReportPeriod>('daily');
  const [periodReport, setPeriodReport] = useState<PeriodReport | null>(null);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  async function load() {
    try {
      const [s, l] = await Promise.all([api.stats(), api.latestReports()]);
      setStats(s);
      setLatest(l);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadPeriod() {
    try {
      setPeriodReport(await api.periodReport(period));
    } catch {
      setPeriodReport(null);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadPeriod();
  }, [period]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'asc');
    }
  }

  const sortedLatest = useMemo(() => {
    const arr = [...latest];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = (a.destName || a.destHost).localeCompare(b.destName || b.destHost, undefined, { numeric: true });
          break;
        case 'asn':
          cmp = (a.asn ?? -1) - (b.asn ?? -1);
          break;
        case 'avgRtt':
          cmp = (a.ping.avgRtt ?? -1) - (b.ping.avgRtt ?? -1);
          break;
        case 'loss':
          cmp = (a.ping.lossPercent ?? 0) - (b.ping.lossPercent ?? 0);
          break;
        case 'hops':
          cmp = (a.hops?.length ?? 0) - (b.hops?.length ?? 0);
          break;
        case 'ran':
          cmp = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [latest, sortKey, sortDir]);

  if (error && !stats) {
    return (
      <div className="card border-red-500/40 text-red-600 dark:text-red-300">
        Failed to reach the API: {error}. Is the backend running?
      </div>
    );
  }

  if (!stats) return <Spinner label="Loading dashboard…" />;

  const chartData = (periodReport?.series ?? []).map((p) => ({
    time: p.day,
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
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Destinations" value={stats.enabledDestinations} sub={`${stats.destinations} total`} to="/destinations" />
        <StatCard label="Reachable" value={stats.recovery.reachable} sub="from latest traces" tone="good" to="/reports" />
        <StatCard label="Unreachable" value={stats.recovery.unreachable} sub="from latest traces" tone={stats.recovery.unreachable ? 'bad' : 'default'} to="/reports" />
        <StatCard
          label="Uptime (24h)"
          value={stats.uptime24h === null ? '—' : `${stats.uptime24h}%`}
          sub="across all destinations"
          tone={stats.uptime24h !== null && stats.uptime24h < 99 ? 'warn' : 'good'}
          to="/reports"
        />
        <StatCard
          label="Avg ping (now)"
          value={stats.networkLatencyMs === null ? '—' : `${Math.round(stats.networkLatencyMs)}ms`}
          sub="network health"
          tone="good"
          to="/destinations"
        />
        <StatCard
          label="Unacked changes"
          value={stats.unacknowledgedChanges}
          sub={`${stats.criticalChanges} critical`}
          tone={stats.unacknowledgedChanges ? 'warn' : 'default'}
          to="/changes"
        />
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tx3">
            Network health
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
        {chartData.length === 0 ? (
          <p className="text-sm text-tx3">
            Not enough data yet — run a trace or wait for the schedule.
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
                <XAxis dataKey="time" interval="preserveStartEnd" minTickGap={24} stroke="rgb(var(--c-tx3))" fontSize={11} tick={{ fill: 'rgb(var(--c-tx3))' }} tickFormatter={(v) => periodTick(period, v)} />
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
                <th className="th">#</th>
                <th className="th">
                  <button className="inline-flex items-center hover:text-tx" onClick={() => toggleSort('name')}>
                    Destination <SortIcon active={sortKey === 'name'} dir={sortDir} />
                  </button>
                </th>
                <th className="th">
                  <button className="inline-flex items-center hover:text-tx" onClick={() => toggleSort('asn')}>
                    ASN / Company <SortIcon active={sortKey === 'asn'} dir={sortDir} />
                  </button>
                </th>
                <th className="th">Status</th>
                <th className="th">
                  <button className="inline-flex items-center hover:text-tx" onClick={() => toggleSort('avgRtt')}>
                    Avg RTT <SortIcon active={sortKey === 'avgRtt'} dir={sortDir} />
                  </button>
                </th>
                <th className="th">
                  <button className="inline-flex items-center hover:text-tx" onClick={() => toggleSort('loss')}>
                    Loss <SortIcon active={sortKey === 'loss'} dir={sortDir} />
                  </button>
                </th>
                <th className="th">
                  <button className="inline-flex items-center hover:text-tx" onClick={() => toggleSort('hops')}>
                    Hops <SortIcon active={sortKey === 'hops'} dir={sortDir} />
                  </button>
                </th>
                <th className="th">
                  <button className="inline-flex items-center hover:text-tx" onClick={() => toggleSort('ran')}>
                    Ran <SortIcon active={sortKey === 'ran'} dir={sortDir} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedLatest.length === 0 && (
                <tr>
                  <td className="td" colSpan={8}>
                    No reports yet — run a trace or wait for the schedule.
                  </td>
                </tr>
              )}
              {sortedLatest.map((r, i) => (
                <tr key={r._id} className="border-b border-edge/50 hover:bg-edge/30">
                  <td className="td font-mono text-xs text-tx3">{i + 1}</td>
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
