import { Server } from 'socket.io';
import { Device } from '../models/Device.js';
import Redis from 'ioredis';
import { config } from '../config.js';

let io;
const activeSockets = new Map(); // socket.id -> deviceId

const subClient = new Redis(config.redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: null });
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
  
  io.on('connection', (socket) => {
    console.log(`[Socket] connected: ${socket.id}`);
    
    socket.on('register_device', async (data) => {
      // data should contain deviceId from Android
      const { deviceId, phoneModel } = data;
      if (!deviceId) return;
      
      activeSockets.set(socket.id, deviceId);
      socket.deviceId = deviceId;
      
      // Count devices to generate label if new
      const count = await Device.countDocuments();
      const label = `Device ${count + 1}`;

      await Device.findOneAndUpdate(
        { deviceId },
        { 
          $set: { isActive: true, lastHeartbeat: new Date(), phoneModel: phoneModel || 'Unknown' },
          $setOnInsert: { createdBy: 'system', label }
        },
        { upsert: true }
      ).catch(err => console.error('[Socket] error updating device:', err));
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
