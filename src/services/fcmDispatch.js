import { emitToDevice } from './socketService.js';
import { config } from '../config.js';

export async function dispatchParallel(batches) {
  // We no longer use Firebase. We emit using socketService.
  const results = await Promise.allSettled(
    batches.map(async ({ deviceId, payload }) => {
      // payload has campaignId, text, imageUrl, assignedNumbersList
      const sent = emitToDevice(deviceId, 'CAMPAIGN_EXECUTE', payload);
      
      if (sent) {
        return { deviceId, success: true };
      } else {
        throw new Error('Device not connected via WebSocket');
      }
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
