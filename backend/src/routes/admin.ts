import { Router } from 'express';
import { issueAdminToken } from '../middleware/auth';
import { verifyAdminPassword } from '../services/settings';

const router = Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !verifyAdminPassword(password)) {
    res.status(401).json({ error: 'Invalid admin password' });
    return;
  }
  const { token, expiresAt } = issueAdminToken();
  res.json({ token, expiresAt });
});

export default router;