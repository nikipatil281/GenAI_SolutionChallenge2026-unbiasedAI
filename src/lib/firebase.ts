import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  projectId: "genai-solution-challenge",
  appId: "1:131055816080:web:e637192d29cb172830b715",
  storageBucket: "genai-solution-challenge.firebasestorage.app",
  apiKey: "AIzaSyAtiFAnOabm_H5e7_dEZBet2Xrtb5ynkek",
  authDomain: "genai-solution-challenge.firebaseapp.com",
  messagingSenderId: "131055816080",
  measurementId: "G-Z3FY0KVHYW",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Connect to emulators if running locally (optional)
if (window.location.hostname === 'localhost' && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
