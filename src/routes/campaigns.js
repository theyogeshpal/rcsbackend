import { Router } from 'express';
import { Campaign } from '../models/Campaign.js';
import { enqueueCampaign } from '../queues/campaignQueue.js';
import { config } from '../config.js';
import { processCampaignById } from '../services/campaignProcessor.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

async function scheduleCampaign(campaignId) {
  if (config.devSync) {
    setImmediate(async () => {
      try {
        await processCampaignById(campaignId);
        console.log('[Sync] Campaign processed:', campaignId);
      } catch (err) {
        console.error('[Sync] Campaign failed:', err.message);
      }
    });
    return;
  }

  try {
    await enqueueCampaign(campaignId);
  } catch (err) {
    console.warn('[Queue] Redis unavailable, falling back to sync:', err.message);
    setImmediate(async () => {
      try {
        await processCampaignById(campaignId);
      } catch (e) {
        console.error('[Sync] Campaign failed:', e.message);
      }
    });
  }
}

router.post('/', async (req, res) => {
  try {
    const { name, text, imageUrl, numbers } = req.body;
    if (!name || !text || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'name, text, and numbers[] are required' });
    }

    const normalized = numbers.map((n) => String(n).replace(/\D/g, '')).filter(Boolean);
    const campaign = await Campaign.create({
      name,
      text,
      imageUrl: imageUrl || '',
      numbers: normalized,
      status: 'queued',
      stats: { total: normalized.length, sent: 0, failed: 0, pending: normalized.length },
      createdBy: req.admin?.username || 'admin',
    });

    await scheduleCampaign(campaign._id);

    res.status(201).json(campaign);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (_req, res) => {
  const campaigns = await Campaign.find().sort({ createdAt: -1 }).select('-numbers').lean();
  res.json(campaigns);
});

router.get('/:id', async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  res.json(campaign);
});

export default router;
