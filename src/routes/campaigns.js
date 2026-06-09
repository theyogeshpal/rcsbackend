import { Router } from 'express';
import { Campaign } from '../models/Campaign.js';
import { enqueueCampaign } from '../queues/campaignQueue.js';
import { config } from '../config.js';
import { processCampaignById } from '../services/campaignProcessor.js';
import { requireAuth } from '../middleware/auth.js';
import { Feedback } from '../models/Feedback.js';
import { Contact } from '../models/Contact.js';

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
    const { name, text, imageUrl, numbers, category } = req.body;
    if (!name || !text) {
      return res.status(400).json({ error: 'name and text are required' });
    }

    let finalNumbers = [];
    if (category) {
      const contacts = await Contact.find({ category }).select('phoneNumber').lean();
      finalNumbers = contacts.map(c => c.phoneNumber);
    } else if (Array.isArray(numbers)) {
      finalNumbers = numbers;
    }

    if (finalNumbers.length === 0) {
      return res.status(400).json({ error: 'No numbers provided or found for the category' });
    }

    const normalized = finalNumbers.map((n) => String(n).replace(/\D/g, '')).filter(Boolean);
    const uniqueNumbers = [...new Set(normalized)];
    
    if (uniqueNumbers.length === 0) {
      return res.status(400).json({ error: 'No valid numbers found' });
    }

    const campaign = await Campaign.create({
      name,
      text,
      imageUrl: imageUrl || '',
      numbers: uniqueNumbers,
      status: 'queued',
      stats: { total: uniqueNumbers.length, sent: 0, failed: 0, pending: uniqueNumbers.length },
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
  try {
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    
    if (campaign.assignments) {
      const { Device } = await import('../models/Device.js');
      for (let a of campaign.assignments) {
        const d = await Device.findOne({ deviceId: a.deviceId }).select('phoneNumbers').lean();
        if (d && d.phoneNumbers) {
          a.phoneNumbers = d.phoneNumbers;
        }
      }
    }
    
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const logs = await Feedback.find({ campaignId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.status === 'processing' || campaign.status === 'queued') {
      return res.status(400).json({ error: 'Campaign is currently in progress' });
    }

    if (campaign.status === 'failed') {
      campaign.status = 'queued';
      await campaign.save();
      await scheduleCampaign(campaign._id);
      return res.json({ success: true, message: 'Campaign queued for retry', newCampaignId: campaign._id });
    }

    const feedbacks = await Feedback.find({ campaignId: campaign._id }).sort({ createdAt: -1 });
    const numberStatus = new Map();
    for (const f of feedbacks) {
      if (!numberStatus.has(f.phoneNumber)) {
        numberStatus.set(f.phoneNumber, f.status);
      }
    }

    const failedNumbers = [];
    for (const n of campaign.numbers) {
      const status = numberStatus.get(n);
      if (status === 'failed' || !status) {
        failedNumbers.push(n);
      }
    }

    if (failedNumbers.length === 0) {
      return res.status(400).json({ error: 'No failed numbers found to retry' });
    }

    const retryCampaign = await Campaign.create({
      name: campaign.name.endsWith(' (Retry)') ? campaign.name : `${campaign.name} (Retry)`,
      text: campaign.text,
      imageUrl: campaign.imageUrl || '',
      numbers: failedNumbers,
      status: 'queued',
      stats: { total: failedNumbers.length, sent: 0, failed: 0, pending: failedNumbers.length },
      createdBy: req.admin?.username || 'admin',
    });

    await scheduleCampaign(retryCampaign._id);
    res.status(201).json({ success: true, message: 'Retry campaign created', newCampaignId: retryCampaign._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/relaunch', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const newCampaign = await Campaign.create({
      name: campaign.name.endsWith(' (Relaunched)') ? campaign.name : `${campaign.name} (Relaunched)`,
      text: campaign.text,
      imageUrl: campaign.imageUrl || '',
      numbers: campaign.numbers,
      status: 'queued',
      stats: { total: campaign.numbers.length, sent: 0, failed: 0, pending: campaign.numbers.length },
      createdBy: req.admin?.username || 'admin',
    });

    await scheduleCampaign(newCampaign._id);
    res.status(201).json({ success: true, message: 'Campaign relaunched successfully', newCampaignId: newCampaign._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const campaign = await Campaign.findByIdAndDelete(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Also delete associated feedback logs to clean up space
    await Feedback.deleteMany({ campaignId });
    
    res.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
