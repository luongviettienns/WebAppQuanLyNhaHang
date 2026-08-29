import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, StatusBar, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors, typography, spacing } from './src/theme';

export default function App() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [apiEndpoint] = useState(process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000');

  const checkHealth = async () => {
    setBackendStatus('checking');
    try {
      const res = await fetch(`${apiEndpoint}/health`);
      if (res.ok) {
        const data = await res.json();
        if (data?.data?.status === 'ok') {
          setBackendStatus('connected');
          return;
        }
      }
      setBackendStatus('disconnected');
    } catch {
      setBackendStatus('disconnected');
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      {/* Header Bar */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🍔</Text>
        <Text style={styles.headerTitle}>CRISPY BITE QSR</Text>
        <Text style={styles.headerSubtitle}>He Thong Quan Ly & Dat Mon Fast Food</Text>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nen Tang Full-Stack San Sang</Text>
          <Text style={styles.cardDesc}>
            He thong da khoi tao thanh cong Monorepo gõi:
          </Text>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>React Native / Expo SDK 54</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: '#FFEDD5' }]}>
              <Text style={[styles.badgeText, { color: colors.secondary }]}>Node.js / Express / TypeScript</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.badgeText, { color: '#B45309' }]}>Prisma ORM & MySQL 8.4</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[styles.badgeText, { color: colors.success }]}>Real-time Socket.io</Text>
            </View>
          </View>

          {/* Status Indicator */}
          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Trang thai Backend API ({apiEndpoint}):</Text>
            <View style={styles.statusRow}>
              {backendStatus === 'checking' && (
                <>
                  <ActivityIndicator size="small" color={colors.secondary} />
                  <Text style={[styles.statusValue, { color: colors.secondary }]}> Dang kiem tra ket noi...</Text>
                </>
              )}
              {backendStatus === 'connected' && (
                <Text style={[styles.statusValue, { color: colors.success }]}>🟢 Ket noi thanh cong (Health: OK)</Text>
              )}
              {backendStatus === 'disconnected' && (
                <Text style={[styles.statusValue, { color: colors.danger }]}>🔴 Chua ket noi Backend (Hay chay npm run dev:backend)</Text>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.retryButton} onPress={checkHealth}>
            <Text style={styles.retryButtonText}>Kiem tra lai ket noi</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>CRISPY BITE QSR • Architecture Foundation Active</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4
  },
  headerEmoji: {
    fontSize: 40,
    marginBottom: spacing.xs
  },
  headerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
    letterSpacing: 1
  },
  headerSubtitle: {
    fontSize: typography.sizes.sm,
    color: '#FEE2E2',
    marginTop: spacing.xs
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center'
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  cardTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm
  },
  cardDesc: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.md
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20
  },
  badgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  statusBox: {
    backgroundColor: '#F8FAFC',
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.lg
  },
  statusLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusValue: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: spacing.touchTargetMobile,
    justifyContent: 'center'
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm
  },
  footer: {
    padding: spacing.md,
    alignItems: 'center'
  },
  footerText: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted
  }
});
