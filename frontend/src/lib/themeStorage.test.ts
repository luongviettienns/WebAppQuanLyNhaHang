import { describe, expect, it } from 'vitest';
import { createThemeStorage, type StringStorage } from './themeStorage';

const createMemoryStorage = (): StringStorage => {
  const values = new Map<string, string>();

  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    }
  };
};

describe('theme storage', () => {
  it('persists a manual preference through native storage when browser storage is unavailable', async () => {
    const nativeStorage = createMemoryStorage();
    const storage = createThemeStorage(nativeStorage, null);

    await storage.setItem('crispy_bite_theme_kitchen', 'light');

    expect(await storage.getItem('crispy_bite_theme_kitchen')).toBe('light');
  });

  it('persists a manual preference through browser storage when it is available', async () => {
    const browserStorage = createMemoryStorage();
    const storage = createThemeStorage(createMemoryStorage(), browserStorage);

    await storage.setItem('crispy_bite_theme_cashier', 'dark');

    expect(await storage.getItem('crispy_bite_theme_cashier')).toBe('dark');
  });
});
