import mongoose from 'mongoose';

const globalSettingsSchema = new mongoose.Schema(
  {
    // Singleton pattern
    _id: { type: String, default: 'global' },
    cooldownMs: { type: Number, default: 8000 },
    dailyLimitPerDevice: { type: Number, default: 100 },
    nextDayStartTime: { type: String, default: '10:00' }, // Time in HH:mm (24-hour format)
  },
  { timestamps: true }
);

export const GlobalSettings = mongoose.model('GlobalSettings', globalSettingsSchema);
