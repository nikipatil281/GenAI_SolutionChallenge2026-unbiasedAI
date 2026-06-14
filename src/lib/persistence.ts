import { auth, db } from './firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

export interface PersistenceDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class FirestoreDriver implements PersistenceDriver {
  async getItem(key: string) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      if (key === 'biasscope.auth.session' && typeof window !== 'undefined') {
        return window.localStorage.getItem(key);
      }
      return null;
    }
    const docRef = doc(db, 'users', uid, 'state', key);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data().value as string;
    }
    return null;
  }

  async setItem(key: string, value: string) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      if (key === 'biasscope.auth.session' && typeof window !== 'undefined') {
        window.localStorage.setItem(key, value);
      }
      return;
    }
    const docRef = doc(db, 'users', uid, 'state', key);
    await setDoc(docRef, { value });
  }

  async removeItem(key: string) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      if (key === 'biasscope.auth.session' && typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
      return;
    }
    const docRef = doc(db, 'users', uid, 'state', key);
    await deleteDoc(docRef);
  }
}

let persistenceDriver: PersistenceDriver = new FirestoreDriver();

export function configurePersistenceDriver(driver: PersistenceDriver) {
  persistenceDriver = driver;
}

export function getPersistenceDriver() {
  return persistenceDriver;
}

export async function readJsonValue<T>(key: string): Promise<T | null> {
  try {
    const raw = await persistenceDriver.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonValue<T>(key: string, value: T) {
  await persistenceDriver.setItem(key, JSON.stringify(value));
}

export async function removeValue(key: string) {
  await persistenceDriver.removeItem(key);
}
