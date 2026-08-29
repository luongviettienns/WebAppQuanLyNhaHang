import React from 'react';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { colors, typography, spacing } from '../../theme';

export const AdminScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>👑 QUẢN TRỊ & BÁO CÁO DOANH THU</Text>
        <Text style={styles.subtitle}>Báo cáo doanh thu, Speed of Service & Quản lý thực đơn</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.badge}>Mô đun M7 & M8</Text>
          <Text style={styles.cardTitle}>Trung Tâm Quản Trị ADMIN</Text>
          <Text style={styles.cardText}>
            Phân hệ độc quyền dành riêng cho ADMIN: Báo cáo kinh doanh, KPI tốc độ phục vụ và Cấu hình hệ thống.
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
    backgroundColor: '#7C3AED',
    padding: spacing.lg,
    alignItems: 'center'
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  subtitle: {
    color: '#EDE9FE',
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
    backgroundColor: '#EDE9FE',
    color: '#6D28D9',
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
