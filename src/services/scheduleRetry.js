import { PendingRetry } from '../models/PendingRetry.js';
import { config } from '../config.js';

export async function scheduleFailedRetry({ campaignId, deviceId, phoneNumber, attempts, lastError }) {
  if (attempts >= config.maxRetries) {
    return false;
  }

  await PendingRetry.findOneAndUpdate(
    { campaignId, phoneNumber },
    {
      campaignId,
      deviceId,
      phoneNumber,
      attempts,
      maxAttempts: config.maxRetries,
      nextRetryAt: new Date(Date.now() + config.cooldownMs),
      inFlight: false,
      lastError: lastError || null,
    },
    { upsert: true, new: true }
  );

  return true;
}

export async function clearRetry(campaignId, phoneNumber) {
  await PendingRetry.deleteOne({ campaignId, phoneNumber });
}
