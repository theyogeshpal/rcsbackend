import { Router } from 'express';
import { GlobalSettings } from '../models/GlobalSettings.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    let settings = await GlobalSettings.findById('global');
    if (!settings) {
      settings = await GlobalSettings.create({ _id: 'global' });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { cooldownMs, dailyLimitPerDevice, nextDayStartTime } = req.body;
    let settings = await GlobalSettings.findById('global');
    if (!settings) {
      settings = new GlobalSettings({ _id: 'global' });
    }
    
    if (cooldownMs !== undefined) settings.cooldownMs = Number(cooldownMs);
    if (dailyLimitPerDevice !== undefined) settings.dailyLimitPerDevice = Number(dailyLimitPerDevice);
    if (nextDayStartTime !== undefined) settings.nextDayStartTime = nextDayStartTime;
    
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
