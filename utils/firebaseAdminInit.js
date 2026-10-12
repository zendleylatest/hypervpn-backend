import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let initialized = false;

/**
 * Single Firebase Admin init for FCM (broadcast, reminder pushes, etc.)
 */
export function ensureFirebaseAdmin() {
  if (initialized && admin.apps?.length) {
    return admin;
  }

  let serviceAccount = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.warn('[firebaseAdminInit] Invalid FIREBASE_SERVICE_ACCOUNT JSON');
    }
  }

  if (!serviceAccount) {
    try {
      const p = path.join(__dirname, '..', 'firebase-service-account.json');
      if (fs.existsSync(p)) {
        serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (e) {
      console.warn('[firebaseAdminInit] Could not read firebase-service-account.json:', e.message);
    }
  }

  if (!serviceAccount) {
    console.warn(
      '[firebaseAdminInit] No credentials: set FIREBASE_SERVICE_ACCOUNT or place firebase-service-account.json — FCM (reminders) disabled'
    );
    return null;
  }

  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    const pid = serviceAccount.project_id || serviceAccount.projectId || '(unknown)';
    console.log('[firebaseAdminInit] Firebase Admin initialized for FCM, project_id:', pid);
  }
  initialized = true;
  return admin;
}

export function getMessaging() {
  const a = ensureFirebaseAdmin();
  return a ? a.messaging() : null;
}
