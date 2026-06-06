import { Queue } from 'bullmq';
import { config } from '../config.js';

export const CAMPAIGN_QUEUE_NAME = 'campaign-processing';

let _queue = null;

function getQueue() {
  if (!_queue) {
    _queue = new Queue(CAMPAIGN_QUEUE_NAME, {
      connection: { 
        url: config.redisUrl,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return _queue;
}

export async function enqueueCampaign(campaignId) {
  if (config.devSync) {
    throw new Error('DEV_SYNC enabled');
  }
  return getQueue().add(
    'process-campaign',
    { campaignId: String(campaignId) },
    { priority: 1 }
  );
}
