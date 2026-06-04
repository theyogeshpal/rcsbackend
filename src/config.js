import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 3001,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rcs_campaign',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  firebaseServiceAccountPath:
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, '..', 'firebase-service-account.json'),
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'rcs-bulk-2fe9a',
  cooldownMs: Number(process.env.COOLDOWN_MS) || 8000,
  deviceHeartbeatTtlMs: Number(process.env.DEVICE_HEARTBEAT_TTL_MS) || 120000,
  devSync: process.env.DEV_SYNC === 'true',
  adminUsername: process.env.ADMIN_USERNAME || 'palyogesh508@gmail.com',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${Number(process.env.PORT) || 3001}`,
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
  maxRetries: Number(process.env.MAX_RETRIES) || 3,
  retryPollMs: Number(process.env.RETRY_POLL_MS) || 5000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
