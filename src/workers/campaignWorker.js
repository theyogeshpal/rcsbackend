import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { config } from '../config.js';
import { CAMPAIGN_QUEUE_NAME } from '../queues/campaignQueue.js';
import { processCampaignById } from '../services/campaignProcessor.js';

async function processCampaign(job) {
  return processCampaignById(job.data.campaignId);
}

async function main() {
  await mongoose.connect(config.mongodbUri);
  console.log('[Worker] MongoDB connected');

  const worker = new Worker(CAMPAIGN_QUEUE_NAME, processCampaign, {
    connection: { url: config.redisUrl },
    concurrency: 2,
  });

  worker.on('completed', (job, result) => {
    console.log(`[Worker] Job ${job.id} completed`, result?.campaignId);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed`, err.message);
  });

  console.log('[Worker] Listening on queue:', CAMPAIGN_QUEUE_NAME);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
