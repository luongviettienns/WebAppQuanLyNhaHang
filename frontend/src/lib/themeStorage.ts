import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StringStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

const browserStorageForCurrentPlatform = (): StringStorage | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    return {
      getItem: async (key) => window.localStorage.getItem(key),
      setItem: async (key, value) => {
        window.localStorage.setItem(key, value);
      }
    };
  } catch {
    return null;
  }
};

export const createThemeStorage = (
  nativeStorage: StringStorage,
  browserStorage: StringStorage | null = browserStorageForCurrentPlatform()
): StringStorage => {
  const storage = browserStorage ?? nativeStorage;

  return {
    getItem: async (key) => {
      try {
        return await storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: async (key, value) => {
      try {
        await storage.setItem(key, value);
      } catch {
        // Theme persistence is optional when the platform storage is unavailable.
      }
    }
  };
};

export const themeStorage = createThemeStorage(AsyncStorage);
