import { config } from '../config.js';
import { Campaign } from '../models/Campaign.js';
import { Device } from '../models/Device.js';
import { loadBalancer } from './loadBalancer.js';
import { buildDevicePayload, dispatchParallel } from './fcmDispatch.js';

export async function processCampaignById(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  campaign.status = 'processing';
  await campaign.save();

  const cutoff = new Date(Date.now() - config.deviceHeartbeatTtlMs);
  const devices = await Device.find({
    isActive: true,
    lastHeartbeat: { $gte: cutoff }
  });

  const active = loadBalancer.syncFromDevices(devices);
  if (active.length === 0) {
    campaign.status = 'failed';
    campaign.error = 'No active devices available';
    await campaign.save();
    throw new Error(campaign.error);
  }

  const buckets = loadBalancer.distribute(campaign.numbers, active.map((d) => d.deviceId));
  const deviceById = new Map(active.map((d) => [d.deviceId, d]));

  const assignments = [];
  const fcmBatches = [];

  for (const [deviceId, numbers] of buckets) {
    if (numbers.length === 0) continue;
    const device = deviceById.get(deviceId);
    if (!device) continue;

    assignments.push({ deviceId, numbers, dispatchedAt: new Date() });
    fcmBatches.push({
      deviceId,
      fcmToken: device.fcmToken,
      payload: buildDevicePayload({
        campaignId: String(campaign._id),
        text: campaign.text,
        imageUrl: campaign.imageUrl,
        assignedNumbersList: numbers,
      }),
    });

    await Device.updateOne(
      { deviceId },
      {
        $inc: {
          'workload.assigned': numbers.length,
          'workload.inProgress': numbers.length,
        },
      }
    );
  }

  const dispatchResults = await dispatchParallel(fcmBatches);

  campaign.assignments = assignments;
  campaign.status = 'dispatched';
  campaign.stats = {
    total: campaign.numbers.length,
    sent: 0,
    failed: 0,
    pending: campaign.numbers.length,
  };
  campaign.error = dispatchResults.some((r) => !r.success)
    ? dispatchResults.filter((r) => !r.success).map((r) => `${r.deviceId}: ${r.error}`).join('; ')
    : null;
  await campaign.save();

  return { campaignId: String(campaign._id), assignments: assignments.length, dispatchResults };
}
