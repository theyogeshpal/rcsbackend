import { Router } from 'express';
import { Device } from '../models/Device.js';
import { loadBalancer } from '../services/loadBalancer.js';

const router = Router();

async function resolveDeviceLabel(deviceId, requestedLabel) {
  const existing = await Device.findOne({ deviceId });
  if (requestedLabel?.trim()) return requestedLabel.trim();
  if (existing?.label) return existing.label;

  const count = await Device.countDocuments();
  return `Device ${count + 1}`;
}

router.post('/register', async (req, res) => {
  try {
    const { deviceId, fcmToken, label } = req.body;
    if (!deviceId || !fcmToken) {
      return res.status(400).json({ error: 'deviceId and fcmToken required' });
    }

    const finalLabel = await resolveDeviceLabel(deviceId, label);

    const device = await Device.findOneAndUpdate(
      { deviceId },
      {
        deviceId,
        fcmToken,
        label: finalLabel,
        isActive: true,
        lastHeartbeat: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/heartbeat', async (req, res) => {
  try {
    const { deviceId, workload } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    const update = { lastHeartbeat: new Date(), isActive: true };
    if (workload) update.workload = workload;

    const device = await Device.findOneAndUpdate({ deviceId }, update, { new: true });
    if (!device) return res.status(404).json({ error: 'Device not registered' });

    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/active', async (_req, res) => {
  const devices = await Device.find({ isActive: true }).sort({ createdAt: 1 });
  loadBalancer.syncFromDevices(devices);
  res.json({
    devices,
    workloadMap: loadBalancer.getWorkloadMap(),
  });
});

export default router;
