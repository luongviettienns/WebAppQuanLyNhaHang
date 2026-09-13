import React, { useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { LoginScreen } from '../features/auth/LoginScreen';
import { TableOrderScreen } from '../features/customer/TableOrderScreen';
import { RoleTabs } from './RoleTabs';

export const RootNavigator: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { theme } = useTheme();

  // Tu dong phat hien tham so so ban khi khach quet ma QR (?table=X hoac #table=X)
  const [guestTableNumber] = useState<number | null>(() => {
    if (typeof window !== 'undefined' && window.location) {
      const searchParams = new URLSearchParams(window.location.search);
      const tableParam = searchParams.get('table');
      if (tableParam && !isNaN(Number(tableParam))) {
        return Number(tableParam);
      }
      const hash = window.location.hash;
      const match = hash.match(/table[=/](\d+)/i);
      if (match && match[1]) {
        return Number(match[1]);
      }
    }
    return null;
  });

  if (guestTableNumber && !user) {
    return <TableOrderScreen tableNumber={guestTableNumber} />;
  }

  if (isLoading && !user) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.surfaceCanvas }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <RoleTabs />;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  }
});
