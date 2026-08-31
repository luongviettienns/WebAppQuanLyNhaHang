import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Role } from '../api/contracts';
import {
  ThemeColors,
  ThemeMode,
  ThemeRole,
  defaultModeForRole,
  darkTheme,
  lightTheme,
  storageKeyForRole
} from '../theme/colors';

interface ThemeContextType {
  themeMode: ThemeMode;
  theme: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setRoleTheme: (role: Role | 'GUEST') => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const savedThemeModeFor = (role: ThemeRole): ThemeMode | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(storageKeyForRole(role));
      return saved === 'light' || saved === 'dark' ? saved : null;
    }
  } catch {
    // Fall back to the role default when storage is unavailable.
  }
  return null;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [role, setRole] = useState<ThemeRole>('GUEST');

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(storageKeyForRole(role), mode);
      }
    } catch {
      // Ignore storage errors
    }
  }, [role]);

  const toggleTheme = useCallback(() => {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light');
  }, [setThemeMode, themeMode]);

  const setRoleTheme = useCallback((nextRole: ThemeRole) => {
    setRole(nextRole);
    setThemeModeState(savedThemeModeFor(nextRole) ?? defaultModeForRole(nextRole));
  }, []);

  const theme = themeMode === 'dark' ? darkTheme : lightTheme;
  const isDark = themeMode === 'dark';

  return (
    <ThemeContext.Provider value={{ themeMode, theme, isDark, toggleTheme, setThemeMode, setRoleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
