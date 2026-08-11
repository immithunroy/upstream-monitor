import { Router } from 'express';
import { env } from '../config/env';
import { issueAdminToken } from '../middleware/auth';

const router = Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password !== env.adminPassword) {
    res.status(401).json({ error: 'Invalid admin password' });
    return;
  }
  const { token, expiresAt } = issueAdminToken();
  res.json({ token, expiresAt });
});

export default router;
