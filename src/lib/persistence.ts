export interface PersistenceDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class BrowserLocalStorageDriver implements PersistenceDriver {
  async getItem(key: string) {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem(key);
  }

  async setItem(key: string, value: string) {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(key, value);
  }

  async removeItem(key: string) {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.removeItem(key);
  }
}

let persistenceDriver: PersistenceDriver = new BrowserLocalStorageDriver();

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
