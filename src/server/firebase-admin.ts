import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const auth = admin.auth();
export const firestore = admin.firestore();
export const storage = admin.storage();
