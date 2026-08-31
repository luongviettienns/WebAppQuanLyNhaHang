import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
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
import { themeStorage } from '../lib/themeStorage';

interface ThemeContextType {
  themeMode: ThemeMode;
  theme: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setRoleTheme: (role: Role | 'GUEST') => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'light' || value === 'dark';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [role, setRole] = useState<ThemeRole>('GUEST');
  const roleThemeRequest = useRef(0);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    void themeStorage.setItem(storageKeyForRole(role), mode);
  }, [role]);

  const toggleTheme = useCallback(() => {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light');
  }, [setThemeMode, themeMode]);

  const setRoleTheme = useCallback((nextRole: ThemeRole) => {
    const request = ++roleThemeRequest.current;
    setRole(nextRole);
    setThemeModeState(defaultModeForRole(nextRole));

    void themeStorage.getItem(storageKeyForRole(nextRole)).then((savedMode) => {
      if (roleThemeRequest.current === request && isThemeMode(savedMode)) {
        setThemeModeState(savedMode);
      }
    });
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
