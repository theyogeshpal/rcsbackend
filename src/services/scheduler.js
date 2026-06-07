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
    } catch (err) {
      console.error('[Scheduler] Error checking scheduled campaigns:', err);
    }
  }, 60000); // 1 minute
}
