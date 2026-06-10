import { Router } from 'express';
import { Feedback } from '../models/Feedback.js';
import { Campaign } from '../models/Campaign.js';
import { Device } from '../models/Device.js';
import { PendingRetry } from '../models/PendingRetry.js';
import { config } from '../config.js';
import { scheduleFailedRetry, clearRetry } from '../services/scheduleRetry.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { campaignId, deviceId, phoneNumber, senderNumber, status, error, durationMs } = req.body;
    if (!campaignId || !deviceId || !phoneNumber || !status) {
      return res.status(400).json({ error: 'campaignId, deviceId, phoneNumber, status required' });
    }

    const normalized = String(phoneNumber).replace(/\D/g, '');

    await Feedback.create({
      campaignId,
      deviceId,
      phoneNumber: normalized,
      senderNumber: senderNumber || 'Unknown',
      status,
      error: error || null,
      durationMs: durationMs || 0,
    });

    await PendingRetry.updateOne(
      { campaignId, phoneNumber: normalized },
      { $set: { inFlight: false } }
    );

    let campaign;

    if (status === 'sent') {
      await clearRetry(campaignId, normalized);
      campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { $inc: { 'stats.sent': 1, 'stats.pending': -1 } },
        { new: true }
      );
    } else {
      const existing = await PendingRetry.findOne({ campaignId, phoneNumber: normalized });
      const attempts = (existing?.attempts ?? 0) + 1;

      const willRetry = await scheduleFailedRetry({
        campaignId,
        deviceId,
        phoneNumber: normalized,
        attempts,
        lastError: error,
      });

      if (willRetry) {
        campaign = await Campaign.findById(campaignId);
      } else {
        await clearRetry(campaignId, normalized);
        campaign = await Campaign.findByIdAndUpdate(
          campaignId,
          { $inc: { 'stats.failed': 1, 'stats.pending': -1 } },
          { new: true }
        );
      }
    }

    await Device.updateOne(
      { deviceId },
      {
        $inc: { 'workload.completed': 1, 'workload.inProgress': -1 },
        lastHeartbeat: new Date(),
      }
    );

    if (campaign && campaign.stats.pending <= 0 && campaign.status === 'dispatched') {
      const pendingRetries = await PendingRetry.countDocuments({ campaignId: campaign._id });
      if (pendingRetries === 0) {
        campaign.status = 'completed';
        await campaign.save();
      }
    }

    res.json({
      ok: true,
      stats: campaign?.stats,
      retryScheduled: status === 'failed' && (await PendingRetry.exists({ campaignId, phoneNumber: normalized })),
      maxRetries: config.maxRetries,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/campaign/:id', async (req, res) => {
  const items = await Feedback.find({ campaignId: req.params.id }).sort({ createdAt: -1 });
  res.json(items);
});

export default router;
