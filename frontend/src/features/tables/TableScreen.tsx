import React from 'react';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { colors, typography, spacing } from '../../theme';

export const TableScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🍽️ SƠ ĐỒ 12 BÀN ĂN</Text>
        <Text style={styles.subtitle}>Theo dõi trạng thái: Trống / Có khách / Chờ dọn</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.badge}>Mô đun M6</Text>
          <Text style={styles.cardTitle}>Sơ Đồ Bàn Nhà Hàng</Text>
          <Text style={styles.cardText}>
            Phân hệ Sơ đồ bàn dành cho CASHIER & ADMIN theo dõi trạng thái bàn thời gian thực.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    backgroundColor: colors.secondary,
    padding: spacing.lg,
    alignItems: 'center'
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  subtitle: {
    color: '#FFEDD5',
    fontSize: typography.sizes.xs,
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
    alignItems: 'center'
  },
  badge: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
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
    color: colors.text,
    marginBottom: spacing.xs
  },
  cardText: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center'
  }
});
