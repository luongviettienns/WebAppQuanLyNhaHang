import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { RestaurantProvider } from './src/contexts/RestaurantContext';
import { RootNavigator } from './src/navigation/RootNavigator';

function AppContent() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RestaurantProvider>
          <AppContent />
        </RestaurantProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

