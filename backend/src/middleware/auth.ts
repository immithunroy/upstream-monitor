import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

export interface AdminTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

function sign(payload: AdminTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.authTokenSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function issueAdminToken(): { token: string; expiresAt: number } {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + env.adminTokenTtlSeconds;
  return { token: sign({ sub: 'admin', iat, exp }), expiresAt: exp * 1000 };
}

export function verifyAdminToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', env.authTokenSecret).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as AdminTokenPayload;
    return payload.sub === 'admin' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !verifyAdminToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
