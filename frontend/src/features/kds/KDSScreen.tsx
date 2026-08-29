import React from 'react';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { colors, typography, spacing } from '../../theme';

export const KDSScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🍳 KDS BẾP (KITCHEN DISPLAY SYSTEM)</Text>
        <Text style={styles.subtitle}>Nhận đơn thời gian thực & cảnh báo thời gian nấu</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.badge}>Mô đun M5</Text>
          <Text style={styles.cardTitle}>Màn Hình Bếp Tương Phản Cao</Text>
          <Text style={styles.cardText}>
            Giao diện Dark Mode chuyên dụng cho Đầu Bếp (KITCHEN) và Quản Lý (ADMIN) nhận đơn Socket.io.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark
  },
  header: {
    backgroundColor: '#1E293B',
    padding: spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  title: {
    color: '#38BDF8',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: typography.sizes.xs,
    marginTop: spacing.xs
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center'
  },
  card: {
    backgroundColor: colors.cardDark,
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center'
  },
  badge: {
    backgroundColor: '#0369A1',
    color: '#E0F2FE',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.md
  },
  cardTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: '#F8FAFC',
    marginBottom: spacing.xs
  },
  cardText: {
    fontSize: typography.sizes.sm,
    color: '#94A3B8',
    textAlign: 'center'
  }
});
