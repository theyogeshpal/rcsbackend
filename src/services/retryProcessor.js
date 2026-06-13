import { PendingRetry } from '../models/PendingRetry.js';
import { Campaign } from '../models/Campaign.js';
import { Device } from '../models/Device.js';
import { buildDevicePayload, dispatchParallel } from './fcmDispatch.js';
import { loadBalancer } from './loadBalancer.js';
import { GlobalSettings } from '../models/GlobalSettings.js';
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
    if (!campaign) {
      await PendingRetry.deleteOne({ _id: retry._id });
      continue;
    }

    let settings = await GlobalSettings.findById('global');
    const cutoff = new Date(Date.now() - config.deviceHeartbeatTtlMs);
    const rawDevices = await Device.find({
      isActive: true,
      lastHeartbeat: { $gte: cutoff }
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const devices = [];
    for (const d of rawDevices) {
      let stats = d.dailyStats;
      if (!stats || stats.date !== todayStr) {
        stats = { date: todayStr, count: 0 };
      }
      const capacity = Math.max(0, (settings?.dailyLimitPerDevice || 500) - stats.count);
      if (capacity > 0) {
        devices.push(d);
      }
    }

    const active = loadBalancer.syncFromDevices(devices);
    
    // Attempt to pick a different device
    let selectedDevice = active.find(d => d.deviceId !== retry.deviceId);
    
    // If no other device available, fallback to original device if it's still active
    if (!selectedDevice) {
      selectedDevice = active.find(d => d.deviceId === retry.deviceId);
    }

    if (!selectedDevice || !selectedDevice.fcmToken) {
      retry.nextRetryAt = new Date(Date.now() + config.cooldownMs * 2);
      await retry.save();
      continue;
    }

    if (retry.deviceId !== selectedDevice.deviceId) {
      retry.deviceId = selectedDevice.deviceId;
    }

    const payload = buildDevicePayload({
      campaignId: String(campaign._id),
      text: campaign.text,
      imageUrl: campaign.imageUrl,
      assignedNumbersList: [retry.phoneNumber],
    });

    const [result] = await dispatchParallel([
      { deviceId: selectedDevice.deviceId, fcmToken: selectedDevice.fcmToken, payload },
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
