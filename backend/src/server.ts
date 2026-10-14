import './lib/asyncErrors';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { connectDb } from './config/db';
import { env } from './config/env';
import apiRouter from './routes';
import { startScheduler } from './services/scheduler';
import { seedDestinations } from './services/seed';
import { loadSettings } from './services/settings';

const app = express();

app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({
    name: 'Upstream Monitoring System API',
    version: '1.0.0',
    endpoints: [
      '/api/health', '/api/admin/login', '/api/destinations', '/api/reports',
      '/api/changes', '/api/traces', '/api/stats', '/api/search',
    ],
  });
});

app.use('/api', apiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Last-resort error handler: a failed request returns JSON instead of crashing the process.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as { code?: string; status?: number; message?: string };
  if (e?.code === 'P2025') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const status = e?.status && e.status >= 400 && e.status < 600 ? e.status : 500;
  if (status >= 500) console.error('[server] request failed:', e?.message || err);
  if (!res.headersSent) res.status(status).json({ error: status >= 500 ? 'Internal server error' : e?.message || 'Bad request' });
});

// Background jobs must never take the API down.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', (reason as Error)?.message || reason);
});

async function main(): Promise<void> {
  try {
    await connectDb();
  } catch (err) {
    console.error('[server] failed to connect to the database:', (err as Error).message);
    process.exit(1);
  }

  await loadSettings();
  await seedDestinations();

  // RIR ASN/company enrichment for the freshly seeded targets, in the background.
  void import('./services/seed')
    .then(({ seedEnrichment }) => seedEnrichment())
    .catch((err) => console.error('[server] seed enrichment failed:', (err as Error).message));

  const server = app.listen(env.port, () => {
    console.log(`[server] Upstream Monitoring API listening on port ${env.port}`);
  });

  startScheduler();

  const shutdown = (signal: string) => {
    console.log(`[server] received ${signal}, shutting down...`);
    server.close(async () => {
      await (await import('./config/db')).disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export { app };

if (require.main === module) {
  main().catch((err) => {
    console.error('[server] fatal error:', err);
    process.exit(1);
  });
}