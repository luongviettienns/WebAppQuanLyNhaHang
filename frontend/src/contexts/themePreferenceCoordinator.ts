import type { ThemeMode } from '../theme/colors';

export const createThemePreferenceCoordinator = (
  applyMode: (mode: ThemeMode) => void
) => {
  let requestVersion = 0;

  return {
    restore: (fallbackMode: ThemeMode, savedPreference: Promise<ThemeMode | null>) => {
      const request = ++requestVersion;
      applyMode(fallbackMode);

      void savedPreference.then((savedMode) => {
        if (requestVersion === request && savedMode) {
          applyMode(savedMode);
        }
      });
    },
    applyManual: (mode: ThemeMode) => {
      requestVersion++;
      applyMode(mode);
    }
  };
};
