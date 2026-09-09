import React, { useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../theme';
import { MenuManagementScreen } from './MenuManagementScreen';

type AdminTab = 'menu' | 'reports';

export const AdminScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<AdminTab>('menu');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Banner Header */}
      <View style={[styles.header, { backgroundColor: isDark ? '#4C1D95' : '#7C3AED', borderBottomColor: theme.border }]}>
        <Text style={styles.title}>👑 TRUNG TÂM QUẢN TRỊ ADMIN</Text>
        <Text style={[styles.subtitle, { color: isDark ? '#DDD6FE' : '#EDE9FE' }]}>
          Quản lý thực đơn món ăn, Báo cáo doanh thu & Tốc độ phục vụ SOS
        </Text>

        {/* Sub Navigation Segmented Tabs */}
        <View style={[styles.tabBar, { backgroundColor: isDark ? '#3B0764' : '#6D28D9' }]}>
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'menu' && (isDark ? styles.tabBtnActiveDark : styles.tabBtnActiveLight)
            ]}
            onPress={() => setActiveTab('menu')}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'menu'
                  ? { color: isDark ? '#FFFFFF' : '#7C3AED', fontWeight: typography.weights.bold }
                  : { color: isDark ? '#C4B5FD' : '#EDE9FE' }
              ]}
            >
              📋 Quản Lý Thực Đơn (M7)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'reports' && (isDark ? styles.tabBtnActiveDark : styles.tabBtnActiveLight)
            ]}
            onPress={() => setActiveTab('reports')}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'reports'
                  ? { color: isDark ? '#FFFFFF' : '#7C3AED', fontWeight: typography.weights.bold }
                  : { color: isDark ? '#C4B5FD' : '#EDE9FE' }
              ]}
            >
              📊 Báo Cáo & KPI (M8)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Tab Content */}
      <View style={styles.content}>
        {activeTab === 'menu' ? (
          <MenuManagementScreen />
        ) : (
          <View style={styles.reportsPlaceholder}>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.badge, { backgroundColor: isDark ? '#5B21B6' : '#EDE9FE', color: isDark ? '#DDD6FE' : '#6D28D9' }]}>
                Mô đun M8 (Task 13)
              </Text>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Báo Cáo Doanh Thu & SOS</Text>
              <Text style={[styles.cardText, { color: theme.textMuted }]}>
                Chỉ số doanh thu theo múi giờ Việt Nam (Asia/Ho_Chi_Minh), thời gian chuẩn bị SOS, Top món bán chạy và xuất hóa đơn PDF.
              </Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 1
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.5
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    marginTop: 2,
    marginBottom: spacing.sm
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    maxWidth: 480,
    width: '100%'
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    minHeight: 38
  },
  tabBtnActiveLight: {
    backgroundColor: '#FFFFFF'
  },
  tabBtnActiveDark: {
    backgroundColor: '#581C87'
  },
  tabBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  content: {
    flex: 1
  },
  reportsPlaceholder: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center'
  },
  card: {
    width: '100%',
    maxWidth: 500,
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
