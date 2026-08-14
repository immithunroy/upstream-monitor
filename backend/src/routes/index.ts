import { Router } from 'express';
import adminRouter from './admin';
import changesRouter from './changes';
import destinationsRouter from './destinations';
import pingsRouter from './pings';
import reportsRouter from './reports';
import searchRouter from './search';
import settingsRouter from './settings';
import statsRouter from './stats';
import tracesRouter from './traces';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

router.use('/admin', adminRouter);
router.use('/destinations', destinationsRouter);
router.use('/reports', reportsRouter);
router.use('/changes', changesRouter);
router.use('/pings', pingsRouter);
router.use('/traces', tracesRouter);
router.use('/stats', statsRouter);
router.use('/search', searchRouter);
router.use('/settings', settingsRouter);

export default router;
