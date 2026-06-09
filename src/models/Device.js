import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    phoneNumbers: { type: [String], default: [] },
    label: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    lastHeartbeat: { type: Date, default: Date.now },
    workload: {
      assigned: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      inProgress: { type: Number, default: 0 },
    },
    dailyStats: {
      date: { type: String, default: '' }, // e.g. "YYYY-MM-DD"
      count: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

export const Device = mongoose.model('Device', deviceSchema);
