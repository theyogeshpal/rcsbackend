import { Campaign } from '../models/Campaign.js';
import { enqueueCampaign } from '../queues/campaignQueue.js';
import { processCampaignById } from './campaignProcessor.js';
import { config } from '../config.js';

export function startScheduler() {
  // Check every minute
  setInterval(async () => {
    try {
      const now = new Date();
      // Find queued campaigns that have a scheduledAt in the past
      const campaigns = await Campaign.find({
        status: 'queued',
        scheduledAt: { $lte: now }
      });

      for (const c of campaigns) {
        console.log(`[Scheduler] Processing scheduled campaign: ${c._id}`);
        // Clear scheduledAt so it doesn't get picked up again if something goes wrong
        c.scheduledAt = null;
        await c.save();

        if (config.devSync) {
          setImmediate(async () => {
            try {
              await processCampaignById(c._id);
            } catch (err) {
              console.error(`[Scheduler] Sync Campaign ${c._id} failed:`, err.message);
            }
          });
        } else {
          try {
            await enqueueCampaign(c._id);
          } catch (err) {
            console.error(`[Scheduler] Queue Campaign ${c._id} failed:`, err.message);
          }
        }
      }

      // Sweep campaigns stuck in dispatched for more than 1 hour
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const stuckCampaigns = await Campaign.find({
        status: 'dispatched',
        updatedAt: { $lte: oneHourAgo }
      });

      for (const c of stuckCampaigns) {
        if (c.stats && c.stats.pending > 0) {
          console.log(`[Scheduler] Marking stuck campaign ${c._id} as failed.`);
          c.stats.failed = (c.stats.failed || 0) + c.stats.pending;
          c.stats.pending = 0;
          c.status = 'failed';
          c.error = 'Campaign timed out while waiting for device feedback.';
          await c.save();
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error checking scheduled campaigns:', err);
    }
  }, 60000); // 1 minute
}
