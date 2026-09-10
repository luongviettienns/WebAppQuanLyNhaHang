import React from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { LoginScreen } from '../features/auth/LoginScreen';
import { RoleTabs } from './RoleTabs';

export const RootNavigator: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { theme } = useTheme();

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
