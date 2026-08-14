import express from 'express';
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

async function main(): Promise<void> {
  try {
    await connectDb();
  } catch (err) {
    console.error('[server] failed to connect to MongoDB:', (err as Error).message);
    process.exit(1);
  }

  await loadSettings();
  await seedDestinations();

  // RIR ASN/company enrichment for the freshly seeded targets, in the background.
  void import('./services/seed').then(({ seedEnrichment }) => seedEnrichment());

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