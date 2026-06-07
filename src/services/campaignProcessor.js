import { config } from '../config.js';
import { Campaign } from '../models/Campaign.js';
import { Device } from '../models/Device.js';
import { GlobalSettings } from '../models/GlobalSettings.js';
import { loadBalancer } from './loadBalancer.js';
import { buildDevicePayload, dispatchParallel } from './fcmDispatch.js';

function getNextDayScheduledTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const nextDay = new Date();
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(hours || 10, minutes || 0, 0, 0);
  return nextDay;
}

export async function processCampaignById(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  campaign.status = 'processing';
  await campaign.save();

  let settings = await GlobalSettings.findById('global');
  if (!settings) {
    settings = await GlobalSettings.create({ _id: 'global' });
  }

  const cutoff = new Date(Date.now() - config.deviceHeartbeatTtlMs);
  const rawDevices = await Device.find({
    isActive: true,
    lastHeartbeat: { $gte: cutoff }
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const devices = [];
  let totalCapacity = 0;

  for (const device of rawDevices) {
    let stats = device.dailyStats;
    if (!stats || stats.date !== todayStr) {
      stats = { date: todayStr, count: 0 };
      device.dailyStats = stats;
      await device.save();
    }
    const capacity = Math.max(0, settings.dailyLimitPerDevice - stats.count);
    if (capacity > 0) {
      devices.push(device);
      totalCapacity += capacity;
    }
  }

  const active = loadBalancer.syncFromDevices(devices);
  if (active.length === 0) {
    campaign.status = 'failed';
    campaign.error = 'No active devices with available daily capacity';
    await campaign.save();
    throw new Error(campaign.error);
  }

  let numbersToProcess = campaign.numbers;
  let numbersToSchedule = [];

  if (campaign.numbers.length > totalCapacity) {
    numbersToProcess = campaign.numbers.slice(0, totalCapacity);
    numbersToSchedule = campaign.numbers.slice(totalCapacity);
  }

  const buckets = loadBalancer.distribute(numbersToProcess, active.map((d) => d.deviceId));
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
      payload: buildDevicePayload({
        campaignId: String(campaign._id),
        text: campaign.text,
        imageUrl: campaign.imageUrl,
        assignedNumbersList: numbers,
        cooldownMs: settings.cooldownMs,
      }),
    });

    device.dailyStats.count += numbers.length;
    await Device.updateOne(
      { deviceId },
      {
        $inc: {
          'workload.assigned': numbers.length,
          'workload.inProgress': numbers.length,
        },
        $set: { dailyStats: device.dailyStats }
      }
    );
  }

  const dispatchResults = await dispatchParallel(fcmBatches);

  campaign.numbers = numbersToProcess;
  campaign.assignments = assignments;
  campaign.status = 'dispatched';
  campaign.stats = {
    total: numbersToProcess.length,
    sent: 0,
    failed: 0,
    pending: numbersToProcess.length,
  };
  campaign.error = dispatchResults.some((r) => !r.success)
    ? dispatchResults.filter((r) => !r.success).map((r) => `${r.deviceId}: ${r.error}`).join('; ')
    : null;
  await campaign.save();

  if (numbersToSchedule.length > 0) {
    const nextCampaignName = campaign.name.includes('(Day') 
      ? campaign.name + ' +' 
      : `${campaign.name} (Day 2)`;
      
    await Campaign.create({
      name: nextCampaignName,
      text: campaign.text,
      imageUrl: campaign.imageUrl,
      numbers: numbersToSchedule,
      status: 'queued',
      stats: { total: numbersToSchedule.length, sent: 0, failed: 0, pending: numbersToSchedule.length },
      scheduledAt: getNextDayScheduledTime(settings.nextDayStartTime),
      createdBy: campaign.createdBy,
    });
  }

  return { campaignId: String(campaign._id), assignments: assignments.length, dispatchResults };
}
