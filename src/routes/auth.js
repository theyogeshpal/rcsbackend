import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (username !== config.adminUsername || password !== config.adminPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ role: 'admin', username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  res.json({
    token,
    user: { username },
    expiresIn: config.jwtExpiresIn,
  });
});

router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret);
    res.json({ user: { username: payload.username } });
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
});

export default router;
