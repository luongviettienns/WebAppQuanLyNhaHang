import React, { useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { LoginScreen } from '../features/auth/LoginScreen';
import { TableOrderScreen } from '../features/customer/TableOrderScreen';
import { RoleTabs } from './RoleTabs';

export const RootNavigator: React.FC = () => {
  const { user, isRestoringSession } = useAuth();
  const { theme } = useTheme();

  // Tu dong phat hien QR token/so ban khi khach quet ma QR
  const [guestQrContext] = useState<{ tableNumber: number | null; qrCodeToken: string | null }>(() => {
    if (typeof window !== 'undefined' && window.location) {
      const searchParams = new URLSearchParams(window.location.search);
      const qrCodeToken = searchParams.get('token') || searchParams.get('qr') || searchParams.get('tableToken');
      const tableParam = searchParams.get('table');
      let tableNumber: number | null = null;
      if (tableParam && !isNaN(Number(tableParam))) {
        tableNumber = Number(tableParam);
      }
      const hash = window.location.hash;
      const tableMatch = hash.match(/table[=/](\d+)/i);
      if (!tableNumber && tableMatch && tableMatch[1]) {
        tableNumber = Number(tableMatch[1]);
      }
      const tokenMatch = hash.match(/(?:token|qr|tableToken)[=/]([^&]+)/i);
      return {
        tableNumber,
        qrCodeToken: qrCodeToken || (tokenMatch?.[1] ? decodeURIComponent(tokenMatch[1]) : null)
      };
    }
    return { tableNumber: null, qrCodeToken: null };
  });

  if ((guestQrContext.qrCodeToken || guestQrContext.tableNumber) && !user) {
    return (
      <TableOrderScreen
        tableNumber={guestQrContext.tableNumber ?? undefined}
        qrCodeToken={guestQrContext.qrCodeToken ?? undefined}
      />
    );
  }

  if (isRestoringSession && !user) {
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
