import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  phoneNumber: { type: String, required: true },
  category: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

export const Contact = mongoose.model('Contact', schema);
