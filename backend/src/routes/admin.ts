import { Router } from 'express';
import { issueAdminToken } from '../middleware/auth';
import { verifyAdminPassword } from '../services/settings';

const router = Router();

/* Brute-force guard: 10 failed logins per client IP per 15 minutes. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; first: number }>();

export function loginBlocked(ip: string, now = Date.now()): boolean {
  const f = failures.get(ip);
  if (!f) return false;
  if (now - f.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

export function recordLoginFailure(ip: string, now = Date.now()): void {
  const f = failures.get(ip);
  if (!f || now - f.first > WINDOW_MS) failures.set(ip, { count: 1, first: now });
  else f.count += 1;
  if (failures.size > 10000) failures.clear();
}

/** Client IP. X-Real-IP is trusted only from a private address (the frontend
 *  nginx on the docker network); a direct caller cannot spoof it to dodge the limit. */
function clientIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const peer = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const real = req.headers['x-real-ip'];
  const fromProxy = /^(10\.|127\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$)/.test(peer);
  return (fromProxy && typeof real === 'string' && real) || peer || 'unknown';
}

router.post('/login', (req, res) => {
  const ip = clientIp(req as never);
  if (loginBlocked(ip)) {
    res.status(429).json({ error: 'Too many failed logins. Try again in 15 minutes.' });
    return;
  }
  const { password } = req.body || {};
  if (typeof password !== 'string' || !verifyAdminPassword(password)) {
    recordLoginFailure(ip);
    res.status(401).json({ error: 'Invalid admin password' });
    return;
  }
  failures.delete(ip);
  const { token, expiresAt } = issueAdminToken();
  res.json({ token, expiresAt });
});

export default router;