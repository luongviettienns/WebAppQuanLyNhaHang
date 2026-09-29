import AsyncStorage from '@react-native-async-storage/async-storage';

const CREDENTIAL_KEY = 'attendance-kiosk-credential-v1';

export interface KioskCredentialStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createKioskCredentialStore(storage: KioskCredentialStorage) {
  return {
    load: () => storage.getItem(CREDENTIAL_KEY),
    async save(credential: string) {
      if (!credential.trim()) throw new Error('Mã phiên kiosk không được để trống.');
      await storage.setItem(CREDENTIAL_KEY, credential);
    },
    clear: () => storage.removeItem(CREDENTIAL_KEY)
  };
}

export const kioskCredentialStore = createKioskCredentialStore(AsyncStorage);
