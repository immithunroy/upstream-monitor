import { Router } from 'express';
import { ChangeEvent } from '../models/ChangeEvent';

const router = Router();

router.get('/', async (req, res) => {
  const { destinationId, severity, page = '1', limit = '50', acknowledged } = req.query;
  const filter: Record<string, unknown> = {};
  if (destinationId) filter.destinationId = destinationId;
  if (severity) filter.severity = severity;
  if (acknowledged === 'true' || acknowledged === 'false') {
    filter.acknowledged = acknowledged === 'true';
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const [total, docs] = await Promise.all([
    ChangeEvent.countDocuments(filter),
    ChangeEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
  ]);

  res.json({ total, page: pageNum, limit: limitNum, data: docs });
});

router.post('/:id/acknowledge', async (req, res) => {
  const event = await ChangeEvent.findByIdAndUpdate(
    req.params.id,
    { acknowledged: true },
    { new: true }
  );
  if (!event) {
    res.status(404).json({ error: 'Change event not found' });
    return;
  }
  res.json(event);
});

export default router;