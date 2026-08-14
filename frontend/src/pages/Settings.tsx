import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { AppSettings, ImportResult, SettingsResponse } from '../lib/types';
import Spinner from '../components/Spinner';

const emptySettings: AppSettings = {
  retentionDays: 365,
  traceCron: '0 */6 * * *',
  pingIntervalMinutes: 5,
  pingCount: 10,
  pingTimeoutMs: 2500,
  traceMaxHops: 30,
  traceTimeoutSeconds: 4,
  rttChangePercentThreshold: 30,
  rttChangeAbsThresholdMs: 15,
  packetLossThreshold: 5,
  rirCacheTtlHours: 24,
  rirEnrichConcurrency: 6,
  rirRequestTimeoutMs: 10000,
};

type Flash = { kind: 'ok' | 'err'; text: string } | null;

function useFlash(): [Flash, (f: Flash) => void] {
  const [flash, setFlash] = useState<Flash>(null);
  return [flash, setFlash];
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [storage, setStorage] = useState<SettingsResponse['storage'] | null>(null);
  const [loading, setLoading] = useState(true);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwFlash, setPwFlash] = useFlash();

  const [saving, setSaving] = useState(false);
  const [saveFlash, setSaveFlash] = useFlash();

  const [retentionBusy, setRetentionBusy] = useState(false);
  const [retentionFlash, setRetentionFlash] = useFlash();

  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importFlash, setImportFlash] = useFlash();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getSettings();
      setSettings({ ...emptySettings, ...res.settings });
      setStorage(res.storage);
    } catch (e) {
      setSaveFlash({ kind: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [setSaveFlash]);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const patch: Partial<AppSettings> = {};
      (Object.keys(emptySettings) as Array<keyof AppSettings>).forEach((key) => {
        if (settings[key] !== emptySettings[key]) (patch as Record<string, unknown>)[key] = settings[key];
      });
      await api.updateSettings(patch);
      setSaveFlash({ kind: 'ok', text: 'Settings saved. Monitoring jobs were rescheduled where needed.' });
      await load();
    } catch (e) {
      setSaveFlash({ kind: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (pw.next.length < 8) {
      setPwFlash({ kind: 'err', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwFlash({ kind: 'err', text: 'New password and confirmation do not match.' });
      return;
    }
    setPwBusy(true);
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwFlash({ kind: 'ok', text: 'Admin password updated.' });
    } catch (e) {
      setPwFlash({ kind: 'err', text: (e as Error).message });
    } finally {
      setPwBusy(false);
    }
  }

  async function purgeNow() {
    if (!window.confirm('Delete all monitoring data older than the configured retention window? This cannot be undone.')) return;
    setRetentionBusy(true);
    try {
      const res = await api.runRetentionNow();
      setRetentionFlash({
        kind: 'ok',
        text: `Purged reports=${res.deleted.traceReports} pings=${res.deleted.pingSamples} changes=${res.deleted.changeEvents}.`,
      });
      await load();
    } catch (e) {
      setRetentionFlash({ kind: 'err', text: (e as Error).message });
    } finally {
      setRetentionBusy(false);
    }
  }

  async function downloadTemplate() {
    try {
      await api.downloadImportTemplate();
    } catch (e) {
      setImportFlash({ kind: 'err', text: (e as Error).message });
    }
  }

  async function upload() {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.importDestinations(file);
      setImportResult(res);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e) {
      setImportFlash({ kind: 'err', text: (e as Error).message });
    } finally {
      setImporting(false);
    }
  }

  if (loading) return <Spinner label="Loading settings…" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-tx">Settings</h1>
        <p className="text-sm text-tx3">Admin password, monitoring tuning, data retention and bulk import.</p>
      </div>

      {/* ------------------------- Admin password ------------------------- */}
      <div className="card">
        <h2 className="mb-3 text-base font-semibold text-tx">Admin password</h2>
        <p className="mb-3 text-sm text-tx3">
          Changes the password used to sign in from the Admin button. Tokens for existing sessions stay valid until they expire.
        </p>
        <div className="grid max-w-md gap-3">
          <div>
            <label className="label">Current password</label>
            <input
              type="password"
              className="input"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">New password</label>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </div>
          </div>
        </div>
        {pwFlash && (
          <div className={`mt-3 text-sm ${pwFlash.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
            {pwFlash.text}
          </div>
        )}
        <button
          className="btn-primary mt-4"
          onClick={changePassword}
          disabled={pwBusy || !pw.current || !pw.next || !pw.confirm}
        >
          {pwBusy ? 'Updating…' : 'Update password'}
        </button>
      </div>

      {/* ----------------------- Monitoring settings ----------------------- */}
      <div className="card">
        <h2 className="mb-1 text-base font-semibold text-tx">Monitoring settings</h2>
        <p className="mb-4 text-sm text-tx3">
          These override the environment defaults at runtime. Trace / ping schedule changes take effect immediately.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Trace schedule (cron)</label>
            <input className="input font-mono" value={settings.traceCron} onChange={(e) => set('traceCron', e.target.value)} />
          </div>
          <div>
            <label className="label">Ping interval (minutes)</label>
            <input
              type="number"
              className="input"
              min={1}
              value={settings.pingIntervalMinutes}
              onChange={(e) => set('pingIntervalMinutes', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Ping packets per sample</label>
            <input
              type="number"
              className="input"
              min={1}
              value={settings.pingCount}
              onChange={(e) => set('pingCount', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Ping timeout (ms)</label>
            <input
              type="number"
              className="input"
              min={100}
              value={settings.pingTimeoutMs}
              onChange={(e) => set('pingTimeoutMs', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Max traceroute hops</label>
            <input
              type="number"
              className="input"
              min={1}
              value={settings.traceMaxHops}
              onChange={(e) => set('traceMaxHops', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Traceroute timeout (s)</label>
            <input
              type="number"
              className="input"
              min={1}
              value={settings.traceTimeoutSeconds}
              onChange={(e) => set('traceTimeoutSeconds', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">RTT change threshold (%)</label>
            <input
              type="number"
              className="input"
              min={0}
              value={settings.rttChangePercentThreshold}
              onChange={(e) => set('rttChangePercentThreshold', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">RTT change min shift (ms)</label>
            <input
              type="number"
              className="input"
              min={0}
              value={settings.rttChangeAbsThresholdMs}
              onChange={(e) => set('rttChangeAbsThresholdMs', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Packet loss threshold (%)</label>
            <input
              type="number"
              className="input"
              min={0}
              max={100}
              value={settings.packetLossThreshold}
              onChange={(e) => set('packetLossThreshold', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">RIR cache TTL (hours)</label>
            <input
              type="number"
              className="input"
              min={1}
              value={settings.rirCacheTtlHours}
              onChange={(e) => set('rirCacheTtlHours', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Enrichment concurrency</label>
            <input
              type="number"
              className="input"
              min={1}
              value={settings.rirEnrichConcurrency}
              onChange={(e) => set('rirEnrichConcurrency', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">RIR request timeout (ms)</label>
            <input
              type="number"
              className="input"
              min={1000}
              value={settings.rirRequestTimeoutMs}
              onChange={(e) => set('rirRequestTimeoutMs', Number(e.target.value))}
            />
          </div>
        </div>
        {saveFlash && (
          <div className={`mt-3 text-sm ${saveFlash.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
            {saveFlash.text}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={saveSettings} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button className="btn-ghost" onClick={load} disabled={saving}>Reset</button>
        </div>
      </div>

      {/* ------------------------ Data retention ------------------------ */}
      <div className="card">
        <h2 className="mb-1 text-base font-semibold text-tx">Data retention</h2>
        <p className="mb-4 text-sm text-tx3">
          Monitoring data (trace reports, ping samples, change events) older than the configured window is purged daily at 03:00.
        </p>
        <div className="grid max-w-md gap-3">
          <div>
            <label className="label">Keep data for (days)</label>
            <input
              type="number"
              className="input"
              min={1}
              value={settings.retentionDays}
              onChange={(e) => set('retentionDays', Number(e.target.value))}
            />
          </div>
        </div>
        {storage && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-tx3">
            <span className="chip">Reports: {storage.traceReports.toLocaleString()}</span>
            <span className="chip">Ping samples: {storage.pingSamples.toLocaleString()}</span>
            <span className="chip">Change events: {storage.changeEvents.toLocaleString()}</span>
            <span className="chip">Destinations: {storage.destinations.toLocaleString()}</span>
          </div>
        )}
        {retentionFlash && (
          <div className={`mt-3 text-sm ${retentionFlash.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
            {retentionFlash.text}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={saveSettings} disabled={saving}>
            {saving ? 'Saving…' : 'Save retention'}
          </button>
          <button className="btn-danger" onClick={purgeNow} disabled={retentionBusy}>
            {retentionBusy ? 'Purging…' : 'Purge old data now'}
          </button>
        </div>
      </div>

      {/* ----------------------- Bulk import ----------------------- */}
      <div className="card">
        <h2 className="mb-1 text-base font-semibold text-tx">Bulk-import destinations</h2>
        <p className="mb-4 text-sm text-tx3">
          Upload an .xlsx or .csv file with columns: Name, Host, Category (service / datacenter / ixp / utility / cdn),
          Location, Region, Description, Enabled (yes / no). Existing hosts are skipped.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-ghost" onClick={downloadTemplate}>Download sample file</button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="text-sm text-tx2 file:mr-3 file:rounded-lg file:border file:border-edge file:bg-panel file:px-3 file:py-1.5 file:text-sm file:text-tx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setImportResult(null);
            }}
          />
          <button className="btn-primary" onClick={upload} disabled={importing || !file}>
            {importing ? 'Importing…' : file ? `Import ${file.name}` : 'Import'}
          </button>
        </div>
        {importFlash && (
          <div className={`mt-3 text-sm ${importFlash.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
            {importFlash.text}
          </div>
        )}
        {importResult && (
          <div className="mt-4 rounded-lg border border-edge bg-ink/40 p-3 text-sm">
            <div className="mb-2 flex flex-wrap gap-2 text-xs">
              <span className="chip">Rows: {importResult.total}</span>
              <span className="chip text-emerald-600 dark:text-emerald-300">Created: {importResult.created}</span>
              <span className="chip text-amber-600 dark:text-amber-400">Skipped: {importResult.skipped}</span>
              <span className="chip text-red-600 dark:text-red-400">Failed: {importResult.failed}</span>
            </div>
            {importResult.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-tx3">
                {importResult.errors.map((e, i) => (
                  <li key={i} className="rounded bg-edge/30 px-2 py-1">
                    <span className="font-mono">row {e.row}</span> <span className="font-mono">{e.host || '—'}</span>: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}