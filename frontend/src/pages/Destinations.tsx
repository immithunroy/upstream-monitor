import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Destination, DestinationCategory } from '../lib/types';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import { CATEGORY_LABEL } from '../lib/format';

const PAGE_SIZE = 50;

const emptyForm = {
  name: '',
  host: '',
  category: 'service' as DestinationCategory,
  location: '',
  region: '',
  description: '',
};

export default function Destinations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const editParam = searchParams.get('edit');
  const [dests, setDests] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');

  async function load() {
    try {
      setDests(await api.listDestinations());
      setError('');
      setPage(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query]);

  // Open the edit modal directly when navigating here with ?edit=<id>.
  useEffect(() => {
    if (editParam) {
      const d = dests.find((x) => x._id === editParam);
      if (d) {
        setForm({
          name: d.name,
          host: d.host,
          category: d.category,
          location: d.location,
          region: d.region,
          description: d.description,
        });
        setEditingId(d._id);
        setShowForm(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [editParam, dests, setSearchParams]);

  async function enrich() {
    setEnriching(true);
    try {
      const res = await api.enrichDestinations();
      setError('');
      await load();
      alert(`RIR enrichment complete: ${res.enriched}/${res.total} attributed.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnriching(false);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(d: Destination) {
    setForm({
      name: d.name,
      host: d.host,
      category: d.category,
      location: d.location,
      region: d.region,
      description: d.description,
    });
    setEditingId(d._id);
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editingId) {
        await api.updateDestination(editingId, form);
      } else {
        await api.createDestination(form);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(d: Destination) {
    try {
      await api.updateDestination(d._id, { enabled: !d.enabled });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(d: Destination) {
    if (!window.confirm(`Delete ${d.name} (${d.host})?`)) return;
    try {
      await api.deleteDestination(d._id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function traceNow(d: Destination) {
    await api.runTrace(d._id);
    alert(`Trace completed for ${d.name}. Check Reports.`);
  }

  async function traceAll() {
    await api.runTrace();
    alert('Full trace completed for all destinations.');
    await load();
  }

  if (loading) return <Spinner label="Loading destinations…" />;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? dests.filter((d) => {
        const hay = [
          d.name,
          d.host,
          String(d.asn ?? ''),
          d.company || '',
          d.location || '',
          d.region || '',
        ].join(' ').toLowerCase();
        return hay.includes(q);
      })
    : dests;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-tx">Destinations</h1>
          <p className="text-sm text-tx3">
            Targets monitored every hour — services, datacenters, IXPs, utilities and CDNs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={enrich} disabled={enriching}>
            {enriching ? 'Enriching…' : 'Enrich ASN / company'}
          </button>
          <button className="btn-ghost" onClick={traceAll}>Run full trace</button>
          <button className="btn-primary" onClick={openCreate}>+ Add destination</button>
        </div>
      </div>

      {error && <div className="card border-red-500/40 text-red-600 dark:text-red-300">{error}</div>}

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
          <input
            className="input w-64"
            placeholder="Search name, host, ASN, company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Pagination page={currentPage} pages={pages} onPage={setPage} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-edge">
                <th className="th">#</th>
                <th className="th">Name</th>
                <th className="th">Host</th>
                <th className="th">ASN / Company</th>
                <th className="th">Type</th>
                <th className="th">Location</th>
                <th className="th">Enabled</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((d, i) => (
                <tr key={d._id} className="border-b border-edge/50 hover:bg-edge/30">
                  <td className="td font-mono text-xs text-tx3">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="td font-medium">
                    {d.name}
                    <div className="text-xs text-tx3">{d.description}</div>
                  </td>
                  <td className="td font-mono text-xs">{d.host}</td>
                  <td className="td">
                    <span className="font-mono text-xs">{d.asn ? `AS${d.asn}` : '—'}</span>
                    <div className="max-w-[200px] truncate text-xs text-tx3">{d.company || ''}</div>
                  </td>
                  <td className="td">
                    <Badge label={CATEGORY_LABEL[d.category] ?? d.category} tone={d.category} />
                  </td>
                  <td className="td">{d.location || '—'}</td>
                  <td className="td">
                    <button
                      onClick={() => toggle(d)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        d.enabled ? 'bg-accent' : 'bg-edge'
                      }`}
                      title={d.enabled ? 'Click to disable' : 'Click to enable'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          d.enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <button className="btn-ghost" onClick={() => traceNow(d)}>Trace</button>
                      <button className="btn-ghost" onClick={() => openEdit(d)}>Edit</button>
                      <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => remove(d)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <Pagination page={currentPage} pages={pages} onPage={setPage} />
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md">
            <h2 className="mb-4 text-lg font-semibold text-tx">{editingId ? 'Edit destination' : 'Add destination'}</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Name *</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Host (domain or IP) *</label>
                <input className="input font-mono" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as DestinationCategory })}>
                  <option value="service">Service</option>
                  <option value="datacenter">Datacenter</option>
                  <option value="ixp">IXP</option>
                  <option value="utility">Utility</option>
                  <option value="cdn">CDN</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Location</label>
                  <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </div>
                <div>
                  <label className="label">Region</label>
                  <input className="input" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving || !form.name || !form.host}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
