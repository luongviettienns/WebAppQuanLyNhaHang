import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/contexts/AuthContext';
import { RestaurantProvider } from './src/contexts/RestaurantContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <AuthProvider>
      <RestaurantProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </RestaurantProvider>
    </AuthProvider>
  );
}
