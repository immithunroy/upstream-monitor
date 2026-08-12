import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { ChangeEvent, Destination } from '../lib/types';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { fmtAgo, fmtDate } from '../lib/format';

export default function Changes() {
  const [searchParams] = useSearchParams();
  const [dests, setDests] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState(searchParams.get('destination') || '');
  const [severity, setSeverity] = useState('');
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const loadDests = useCallback(async () => {
    setDests(await api.listDestinations());
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listChanges({
        destinationId: destinationId || undefined,
        severity: severity || undefined,
        page,
        limit,
      });
      setEvents(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [destinationId, severity, page]);

  useEffect(() => {
    loadDests();
  }, [loadDests]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const pages = Math.max(1, Math.ceil(total / limit));

  async function ack(e: ChangeEvent) {
    await api.acknowledgeChange(e._id);
    await loadEvents();
  }

  async function ackAll() {
    const res = await api.acknowledgeAllChanges(destinationId || undefined);
    if (res.acknowledged > 0) await loadEvents();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-tx">Detected Changes</h1>
          <p className="text-sm text-tx3">
            Differences logged between consecutive trace reports per destination
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={ackAll}>Acknowledge all</button>
          <select
            className="input w-56"
            value={destinationId}
            onChange={(e) => {
              setDestinationId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All destinations</option>
            {dests.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
          <select
            className="input w-32"
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <Spinner label="Loading changes…" />
        ) : events.length === 0 ? (
          <p className="text-sm text-tx3">
            No changes detected yet. Changes appear after at least two hourly reports exist for a destination.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e._id} className="rounded-lg border border-edge bg-ink/40">
                <button
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => setExpanded(expanded === e._id ? null : e._id)}
                >
                  <div className="flex items-center gap-3">
                    <Badge label={e.severity} tone={e.severity} />
                    {!e.acknowledged && (
                      <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">new</span>
                    )}
                    <span className="font-medium text-tx">
                      <Link to={`/destination/${e.destinationId}`} className="hover:text-accent" onClick={(ev) => ev.stopPropagation()}>
                        {e.destName || e.destHost}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-tx3">{e.destHost}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-tx3">
                    <span className="hidden md:inline">{e.summary}</span>
                    <span className="font-mono">{fmtAgo(e.createdAt)}</span>
                    <span>{e.changes.length} change(s)</span>
                  </div>
                </button>

                {expanded === e._id && (
                  <div className="border-t border-edge px-4 py-3">
                    <p className="mb-2 text-xs text-tx3">
                      Detected {fmtDate(e.createdAt)} ·{' '}
                      <button className="underline hover:text-tx" onClick={() => ack(e)}>
                        {e.acknowledged ? 'acknowledged' : 'mark acknowledged'}
                      </button>
                    </p>
                    <ul className="space-y-1.5">
                      {e.changes.map((c, i) => (
                        <li key={i} className="rounded bg-edge/30 px-3 py-1.5 text-sm text-tx2">
                          <span className="mr-2 rounded bg-edge px-1.5 py-0.5 font-mono text-[10px] uppercase text-tx3">
                            {c.type}
                          </span>
                          {c.hopTtl !== null && c.hopTtl !== undefined && (
                            <span className="mr-2 font-mono text-xs text-tx3">TTL {c.hopTtl}</span>
                          )}
                          {c.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-tx3">Page {page} of {pages}</span>
              <div className="flex gap-2">
                <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
