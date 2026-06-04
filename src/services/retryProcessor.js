import { PendingRetry } from '../models/PendingRetry.js';
import { Campaign } from '../models/Campaign.js';
import { Device } from '../models/Device.js';
import { buildDevicePayload, dispatchParallel } from './fcmDispatch.js';
import { config } from '../config.js';

let intervalId = null;

export async function processDueRetries() {
  const due = await PendingRetry.find({
    inFlight: false,
    nextRetryAt: { $lte: new Date() },
    attempts: { $lt: config.maxRetries },
  }).limit(50);

  for (const retry of due) {
    const campaign = await Campaign.findById(retry.campaignId);
    const device = await Device.findOne({ deviceId: retry.deviceId, isActive: true });
    if (!campaign || !device?.fcmToken) {
      await PendingRetry.deleteOne({ _id: retry._id });
      continue;
    }

    const payload = buildDevicePayload({
      campaignId: String(campaign._id),
      text: campaign.text,
      imageUrl: campaign.imageUrl,
      assignedNumbersList: [retry.phoneNumber],
    });

    const [result] = await dispatchParallel([
      { deviceId: device.deviceId, fcmToken: device.fcmToken, payload },
    ]);

    if (result.success) {
      retry.inFlight = true;
      await retry.save();
    } else {
      retry.lastError = result.error;
      retry.nextRetryAt = new Date(Date.now() + config.cooldownMs);
      await retry.save();
    }
  }
}

export function startRetryProcessor() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    processDueRetries().catch((err) => console.error('[Retry]', err.message));
  }, config.retryPollMs);
  console.log('[Retry] Processor started');
}

export function stopRetryProcessor() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}
