import { Server } from 'socket.io';
import { Device } from '../models/Device.js';

let io;
const activeSockets = new Map(); // socket.id -> deviceId

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
      
      // Update device in DB
      await Device.findOneAndUpdate(
        { deviceId },
        { 
          $set: { isActive: true, lastHeartbeat: new Date(), phoneModel: phoneModel || 'Unknown' },
          $setOnInsert: { createdBy: 'system' }
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
