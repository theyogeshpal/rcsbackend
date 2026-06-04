import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { config } from '../config.js';

let initialized = false;

function loadServiceAccount() {
  if (config.firebaseServiceAccountJson) {
    return JSON.parse(config.firebaseServiceAccountJson);
  }
  if (existsSync(config.firebaseServiceAccountPath)) {
    return JSON.parse(readFileSync(config.firebaseServiceAccountPath, 'utf8'));
  }
  return null;
}

function initFirebase() {
  if (initialized) return;
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.warn('[FCM] Firebase credentials missing — set FIREBASE_SERVICE_ACCOUNT_JSON on Render.');
    return;
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: config.firebaseProjectId,
  });
  initialized = true;
  console.log('[FCM] Firebase initialized:', config.firebaseProjectId);
}

export async function dispatchParallel(batches) {
  initFirebase();
  if (!initialized) {
    return batches.map((b) => ({
      deviceId: b.deviceId,
      success: false,
      error: 'Firebase not initialized',
    }));
  }

  const messaging = admin.messaging();

  const results = await Promise.allSettled(
    batches.map(async ({ deviceId, fcmToken, payload }) => {
      const data = {};
      for (const [k, v] of Object.entries(payload)) {
        data[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }

      await messaging.send({
        token: fcmToken,
        data,
        android: { priority: 'high' },
      });

      return { deviceId, success: true };
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      deviceId: batches[i].deviceId,
      success: false,
      error: r.reason?.message || String(r.reason),
    };
  });
}

export function buildDevicePayload({ campaignId, text, imageUrl, assignedNumbersList }) {
  return {
    type: 'CAMPAIGN_EXECUTE',
    campaignId,
    text,
    imageUrl: imageUrl || '',
    assignedNumbersList: JSON.stringify(assignedNumbersList),
    cooldownMs: String(config.cooldownMs),
  };
}
