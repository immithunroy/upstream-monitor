import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import prisma from '../config/prisma';
import { env } from '../config/env';

export type SettingValue = string | number | boolean;

interface SettingDef {
  type: 'string' | 'int' | 'float' | 'boolean';
  envDefault: () => SettingValue;
  min?: number;
  max?: number;
}

/**
 * Runtime-tunable settings. Values persisted in the `settings` table override
 * environment-variable defaults at runtime, so an operator can change them from
 * the UI without redeploying the container.
 */
export const SETTING_DEFS: Record<string, SettingDef> = {
  /* Data retention — purge monitoring data older than this many days. */
  retentionDays: { type: 'int', envDefault: () => env.retentionDays, min: 1, max: 36500 },
  /* Trace scheduler (cron expression, default = once every 6 hours). */
  traceCron: { type: 'string', envDefault: () => env.traceCron },
  /* Ping / traceroute tuning. */
  pingIntervalMinutes: { type: 'int', envDefault: () => env.pingIntervalMinutes, min: 1, max: 1440 },
  pingCount: { type: 'int', envDefault: () => env.pingCount, min: 1, max: 100 },
  pingTimeoutMs: { type: 'int', envDefault: () => env.pingTimeoutMs, min: 100, max: 60000 },
  traceMaxHops: { type: 'int', envDefault: () => env.traceMaxHops, min: 1, max: 64 },
  traceTimeoutSeconds: { type: 'int', envDefault: () => env.traceTimeoutSeconds, min: 1, max: 60 },
  /* Change detection thresholds. */
  rttChangePercentThreshold: { type: 'float', envDefault: () => env.rttChangePercentThreshold, min: 0, max: 1000 },
  rttChangeAbsThresholdMs: { type: 'float', envDefault: () => env.rttChangeAbsThresholdMs, min: 0, max: 60000 },
  packetLossThreshold: { type: 'float', envDefault: () => env.packetLossThreshold, min: 0, max: 100 },
  /* RIR ASN/company enrichment. */
  rirCacheTtlHours: { type: 'int', envDefault: () => env.rirCacheTtlHours, min: 1, max: 8760 },
  rirEnrichConcurrency: { type: 'int', envDefault: () => env.rirEnrichConcurrency, min: 1, max: 50 },
  rirRequestTimeoutMs: { type: 'int', envDefault: () => env.rirRequestTimeoutMs, min: 1000, max: 60000 },
};

/** Key that never leaves the server — stored only in the DB cache, never exposed. */
const SECRET_KEY = 'adminPasswordHash';

const cache = new Map<string, SettingValue>();

export function validateSetting(key: string, value: SettingValue): string | null {
  const def = SETTING_DEFS[key];
  if (!def) return `Unknown setting "${key}"`;
  if (def.type === 'string') {
    if (typeof value !== 'string' || value.trim() === '') return `${key} must be a non-empty string`;
    return null;
  }
  if (def.type === 'boolean') {
    if (typeof value !== 'boolean') return `${key} must be a boolean`;
    return null;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return `${key} must be a number`;
  if (def.min !== undefined && num < def.min) return `${key} must be >= ${def.min}`;
  if (def.max !== undefined && num > def.max) return `${key} must be <= ${def.max}`;
  return null;
}

/** Load all persisted settings into memory (called once at startup). */
export async function loadSettings(): Promise<void> {
  try {
    const rows = await prisma.setting.findMany();
    cache.clear();
    for (const row of rows) cache.set(row.key, row.value as SettingValue);
  } catch (err) {
    console.error('[settings] failed to load settings from DB:', (err as Error).message);
  }
}

/** Merged view of settings: environment defaults overridden by DB values. */
export function getSettings(): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const key of Object.keys(SETTING_DEFS)) {
    out[key] = cache.has(key) ? (cache.get(key) as SettingValue) : SETTING_DEFS[key].envDefault();
  }
  return out;
}

/** Read a single setting (DB override or env default). */
export function getSetting(key: string): SettingValue {
  if (cache.has(key)) return cache.get(key) as SettingValue;
  const def = SETTING_DEFS[key];
  return def ? def.envDefault() : '';
}

/** Read a single setting coerced to a number (falls back to `fallback`). */
export function getSettingNumber(key: string, fallback: number): number {
  const v = getSetting(key);
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Persist + cache one setting after validation. */
export async function setSetting(key: string, value: SettingValue): Promise<SettingValue> {
  const err = validateSetting(key, value);
  if (err) throw new Error(err);
  const coerced = SETTING_DEFS[key].type === 'string' || SETTING_DEFS[key].type === 'boolean'
    ? value
    : SETTING_DEFS[key].type === 'int'
      ? Math.round(Number(value))
      : Number(value);
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: coerced as never },
    update: { value: coerced as never },
  });
  cache.set(key, coerced as SettingValue);
  console.log(`[settings] ${key} updated to`, coerced);
  return coerced as SettingValue;
}

/** Persist + cache multiple settings at once (all-or-nothing). */
export async function setSettings(patch: Record<string, SettingValue>): Promise<Record<string, SettingValue>> {
  for (const [key, value] of Object.entries(patch)) {
    const err = validateSetting(key, value);
    if (err) throw new Error(err);
  }
  for (const [key, value] of Object.entries(patch)) {
    await setSetting(key, value);
  }
  return getSettings();
}

/* ------------------------------ Admin password ------------------------------ */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyHashedPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Whether a custom admin password has been configured in the DB. */
export function hasCustomAdminPassword(): boolean {
  return cache.has(SECRET_KEY);
}

/** Verify a candidate admin password: DB hash if set, else env default. */
export function verifyAdminPassword(password: string): boolean {
  const stored = cache.get(SECRET_KEY);
  if (stored) return verifyHashedPassword(password, String(stored));
  return password === env.adminPassword;
}

/** Change the admin password and persist the hash. */
export async function setAdminPassword(password: string): Promise<void> {
  const hash = hashPassword(password);
  await prisma.setting.upsert({
    where: { key: SECRET_KEY },
    create: { key: SECRET_KEY, value: hash },
    update: { value: hash },
  });
  cache.set(SECRET_KEY, hash);
}