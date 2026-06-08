import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Template = mongoose.model('Template', schema);
