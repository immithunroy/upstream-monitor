import { Router } from 'express';
import cron from 'node-cron';
import prisma from '../config/prisma';
import { requireAdmin } from '../middleware/auth';
import { getSettings, setSettings, setAdminPassword, verifyAdminPassword, getSettingNumber } from '../services/settings';
import { runRetention } from '../services/retention';
import { restartScheduler } from '../services/scheduler';
import type { SettingValue } from '../services/settings';

const router = Router();

/** Current settings (admin only — reveals tuning values, never secrets). */
router.get('/', requireAdmin, async (_req, res) => {
  const [traceReports, pingSamples, changeEvents, destinations] = await Promise.all([
    prisma.traceReport.count(),
    prisma.pingSample.count(),
    prisma.changeEvent.count(),
    prisma.destination.count(),
  ]);
  res.json({
    settings: getSettings(),
    storage: { traceReports, pingSamples, changeEvents, destinations },
  });
});

/** Update one or more settings. Returns the updated merged view. */
router.put('/', requireAdmin, async (req, res) => {
  const patch = (req.body ?? {}) as Record<string, unknown>;
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No settings provided' });
    return;
  }
  try {
    if ('traceCron' in patch) {
      const expr = String(patch.traceCron ?? '');
      if (!cron.validate(expr)) {
        res.status(400).json({ error: `Invalid cron expression: "${expr}"` });
        return;
      }
    }
    const cleaned: Record<string, SettingValue> = {};
    for (const [key, value] of Object.entries(patch)) {
      cleaned[key] = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : String(value ?? '');
    }
    await setSettings(cleaned);
    // Schedules depend on these two keys — reschedule so the change applies now.
    if ('traceCron' in patch || 'pingIntervalMinutes' in patch) {
      restartScheduler();
    }
    res.json({ settings: getSettings() });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Change the admin password. */
router.post('/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'currentPassword and newPassword are required' });
    return;
  }
  if (!verifyAdminPassword(currentPassword)) {
    res.status(403).json({ error: 'Current password is incorrect' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }
  try {
    await setAdminPassword(newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Run the retention purge immediately. */
router.post('/retention/run', requireAdmin, async (_req, res) => {
  try {
    const deleted = await runRetention();
    res.json({ ok: true, deleted, retentionDays: getSettingNumber('retentionDays', 365) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;