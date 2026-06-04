import mongoose from 'mongoose';

const pendingRetrySchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    deviceId: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextRetryAt: { type: Date, required: true },
    inFlight: { type: Boolean, default: false },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

pendingRetrySchema.index({ nextRetryAt: 1, inFlight: 1 });
pendingRetrySchema.index({ campaignId: 1, phoneNumber: 1 }, { unique: true });

export const PendingRetry = mongoose.model('PendingRetry', pendingRetrySchema);
