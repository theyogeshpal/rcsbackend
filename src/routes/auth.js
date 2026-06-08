import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { Admin } from '../models/Admin.js';
import { seedAdmin, defaultAdmin } from '../seeders/adminSeeder.js';

const router = Router();

router.get('/adminregister', async (req, res) => {
  try {
    const result = await seedAdmin();
    // Return the default credentials in the response so the user knows how to login
    res.json({
      ...result,
      defaultCredentials: {
        email: defaultAdmin.email,
        password: defaultAdmin.password
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body; // 'username' is actually the email from the frontend
  if (!username || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const admin = await Admin.findOne({ email: username.toLowerCase().trim() });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ role: 'admin', email: admin.email, name: admin.name }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({
      token,
      user: { username: admin.email, name: admin.name },
      expiresIn: config.jwtExpiresIn,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret);
    res.json({ user: { username: payload.email, name: payload.name } });
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
});

export default router;
