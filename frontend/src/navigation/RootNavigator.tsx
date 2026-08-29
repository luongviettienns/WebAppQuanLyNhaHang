import React from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { LoginScreen } from '../features/auth/LoginScreen';
import { RoleTabs } from './RoleTabs';
import { colors } from '../theme';

export const RootNavigator: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading && !user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
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
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center'
  }
});
