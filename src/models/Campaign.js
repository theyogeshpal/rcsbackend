import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    text: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    numbers: [{ type: String, required: true }],
    status: {
      type: String,
      enum: ['pending', 'queued', 'processing', 'dispatched', 'completed', 'failed'],
      default: 'pending',
    },
    assignments: [
      {
        deviceId: String,
        numbers: [String],
        dispatchedAt: Date,
      },
    ],
    stats: {
      total: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
    },
    error: { type: String, default: null },
    scheduledAt: { type: Date, default: null },
    createdBy: { type: String, default: 'admin' },
  },
  { timestamps: true }
);

export const Campaign = mongoose.model('Campaign', campaignSchema);
