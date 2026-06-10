import { Server } from 'socket.io';
import { Device } from '../models/Device.js';
import Redis from 'ioredis';
import { config } from '../config.js';
import { redistributeAbortedNumbers } from './campaignProcessor.js';

let io;
const activeSockets = new Map(); // socket.id -> deviceId

const subClient = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
subClient.subscribe('dispatch_campaign').catch(console.error);

subClient.on('message', (channel, message) => {
  if (channel === 'dispatch_campaign') {
    try {
      const { deviceId, payload } = JSON.parse(message);
      emitToDevice(deviceId, 'CAMPAIGN_EXECUTE', payload);
    } catch (e) {
      console.error('[Socket] Redis message parse error:', e);
    }
  }
});

export function initSocket(server) {
  io = new Server(server, { cors: { origin: '*' } });
  
  setInterval(async () => {
    if (activeSockets.size === 0) return;
    const deviceIds = Array.from(new Set(activeSockets.values()));
    try {
      await Device.updateMany(
        { deviceId: { $in: deviceIds } },
        { $set: { lastHeartbeat: new Date(), isActive: true } }
      );
    } catch (err) {
      console.error('[Socket] Periodic heartbeat error:', err);
    }
  }, 30000);

  io.on('connection', (socket) => {
    console.log(`[Socket] connected: ${socket.id}`);
    
    socket.on('register_device', async (data) => {
      // data should contain deviceId from Android
      const { deviceId, phoneModel, phoneNumbers } = data;
      if (!deviceId) return;
      
      activeSockets.set(socket.id, deviceId);
      socket.deviceId = deviceId;
      
      // Count devices to generate label if new
      const count = await Device.countDocuments();
      const label = `Device ${count + 1}`;

      await Device.findOneAndUpdate(
        { deviceId },
        { 
          $set: { 
            isActive: true, 
            lastHeartbeat: new Date(), 
            phoneModel: phoneModel || 'Unknown',
            ...(phoneNumbers ? { phoneNumbers } : {})
          },
          $setOnInsert: { createdBy: 'system', label }
        },
        { upsert: true }
      ).catch(err => console.error('[Socket] error updating device:', err));
    });
    
    socket.on('abort_campaign', async (data) => {
      const { deviceId, campaignId, unprocessedNumbers } = data;
      if (!deviceId || !campaignId || !unprocessedNumbers) return;

      console.log(`[Socket] Device ${deviceId} aborted campaign ${campaignId}. Reclaiming ${unprocessedNumbers.length} numbers.`);

      await Device.findOneAndUpdate(
        { deviceId },
        { 
          $set: { isActive: false, 'workload.assigned': 0, 'workload.inProgress': 0 },
        }
      );

      try {
        await redistributeAbortedNumbers(campaignId, deviceId, unprocessedNumbers);
      } catch (err) {
        console.error('[Socket] Redistribution failed:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] disconnected: ${socket.id}`);
      activeSockets.delete(socket.id);
    });
  });
}

export function getSocketIo() {
  return io;
}

export function emitToDevice(deviceId, event, payload) {
  if (!io) return false;
  let sent = false;
  for (const [socketId, devId] of activeSockets.entries()) {
    if (devId === deviceId) {
      io.to(socketId).emit(event, payload);
      sent = true;
    }
  }
  return sent;
}
