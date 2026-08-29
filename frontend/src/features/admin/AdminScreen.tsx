import React from 'react';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../theme';

export const AdminScreen: React.FC = () => {
  const { theme, isDark } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: isDark ? '#4C1D95' : '#7C3AED', borderBottomColor: theme.border }]}>
        <Text style={styles.title}>👑 QUẢN TRỊ & BÁO CÁO DOANH THU</Text>
        <Text style={[styles.subtitle, { color: isDark ? '#DDD6FE' : '#EDE9FE' }]}>
          Báo cáo doanh thu, Speed of Service & Quản lý thực đơn
        </Text>
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.badge, { backgroundColor: isDark ? '#5B21B6' : '#EDE9FE', color: isDark ? '#DDD6FE' : '#6D28D9' }]}>
            Mô đun M7 & M8
          </Text>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Trung Tâm Quản Trị ADMIN</Text>
          <Text style={[styles.cardText, { color: theme.textMuted }]}>
            Phân hệ độc quyền dành riêng cho ADMIN: Báo cáo kinh doanh, KPI tốc độ phục vụ và Cấu hình hệ thống.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    padding: spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 1
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    marginTop: spacing.xs
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center'
  },
  card: {
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3
  },
  badge: {
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
    marginBottom: spacing.xs
  },
  cardText: {
    fontSize: typography.sizes.sm,
    textAlign: 'center'
  }
});
