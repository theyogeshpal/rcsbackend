import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    fcmToken: { type: String, required: true },
    label: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    lastHeartbeat: { type: Date, default: Date.now },
    workload: {
      assigned: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      inProgress: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const Device = mongoose.model('Device', deviceSchema);
