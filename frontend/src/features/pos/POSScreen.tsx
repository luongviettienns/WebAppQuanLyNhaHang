import React from 'react';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { colors, typography, spacing } from '../../theme';

export const POSScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🛒 MÀN HÌNH THU NGÂN POS</Text>
        <Text style={styles.subtitle}>Gọi món, cấu hình Modifier & thanh toán hóa đơn</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.badge}>Mô đun M3 & M4</Text>
          <Text style={styles.cardTitle}>Sẵn sàng tiếp nhận Menu thực tế</Text>
          <Text style={styles.cardText}>
            Phân hệ POS đã được phân quyền truy cập thành công cho vai trò CASHIER và ADMIN.
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
    backgroundColor: colors.primary,
    padding: spacing.lg,
    alignItems: 'center'
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  subtitle: {
    color: '#FEE2E2',
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
    backgroundColor: '#FEF3C7',
    color: '#B45309',
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
