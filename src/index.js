import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import campaignsRouter from './routes/campaigns.js';
import devicesRouter from './routes/devices.js';
import feedbackRouter from './routes/feedback.js';
import authRouter from './routes/auth.js';
import uploadRouter from './routes/upload.js';
import { startRetryProcessor } from './services/retryProcessor.js';

const app = express();

app.use(
  cors({
    origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(','),
    credentials: config.corsOrigin !== '*',
  })
);
app.use(express.json({ limit: '50mb' }));

app.use('/uploads', express.static(config.uploadsDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'rcs-campaign-backend', project: config.firebaseProjectId });
});

app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/feedback', feedbackRouter);

async function start() {
  await mongoose.connect(config.mongodbUri);
  console.log('[API] MongoDB connected');

  startRetryProcessor();

  app.listen(config.port, () => {
    console.log(`[API] Server listening on port ${config.port}`);
    console.log(`[API] Public URL: ${config.publicBaseUrl}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
