import Redis from 'ioredis';
import { config } from '../config.js';

const redis = new Redis(config.redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: null });

export async function dispatchParallel(batches) {
  // Publish to Redis so the web server process can emit via Socket.io
  const results = await Promise.allSettled(
    batches.map(async ({ deviceId, payload }) => {
      const msg = JSON.stringify({ deviceId, payload });
      await redis.publish('dispatch_campaign', msg);
      return { deviceId, success: true };
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      deviceId: batches[i].deviceId,
      success: false,
      error: r.reason?.message || String(r.reason),
    };
  });
}

export function buildDevicePayload({ campaignId, text, imageUrl, assignedNumbersList }) {
  // WebSockets can handle complex objects natively, no need to stringify arrays.
  return {
    type: 'CAMPAIGN_EXECUTE',
    campaignId,
    text,
    imageUrl: imageUrl || '',
    assignedNumbersList, // Array
    cooldownMs: config.cooldownMs,
  };
}
