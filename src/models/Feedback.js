import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    deviceId: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    senderNumber: { type: String, default: 'Unknown' },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    error: { type: String, default: null },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Feedback = mongoose.model('Feedback', feedbackSchema);
