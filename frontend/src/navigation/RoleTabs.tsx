import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { typography, spacing } from '../theme';
import { POSScreen } from '../features/pos/POSScreen';
import { TableScreen } from '../features/tables/TableScreen';
import { TableOrderScreen } from '../features/customer/TableOrderScreen';
import { KDSScreen } from '../features/kds/KDSScreen';
import { AdminScreen } from '../features/admin/AdminScreen';

type TabKey = 'pos' | 'tables' | 'qr_table' | 'kds' | 'admin';

interface TabItem {
  key: TabKey;
  label: string;
  component: React.ComponentType;
}

export const RoleTabs: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();

  // Xác định danh sách Tab khả dụng theo Role
  const getTabsForRole = (): TabItem[] => {
    switch (user?.role) {
      case 'CASHIER':
        return [
          { key: 'pos', label: '🛒 POS Thu Ngân', component: POSScreen },
          { key: 'tables', label: '🍽️ Sơ Đồ Bàn', component: TableScreen },
          { key: 'qr_table', label: '📱 Khách QR Bàn', component: TableOrderScreen }
        ];
      case 'KITCHEN':
        return [
          { key: 'kds', label: '🍳 Bếp KDS', component: KDSScreen }
        ];
      case 'ADMIN':
      default:
        return [
          { key: 'pos', label: '🛒 POS Thu Ngân', component: POSScreen },
          { key: 'tables', label: '🍽️ Sơ Đồ Bàn', component: TableScreen },
          { key: 'qr_table', label: '📱 Khách QR Bàn', component: TableOrderScreen },
          { key: 'kds', label: '🍳 Bếp KDS', component: KDSScreen },
          { key: 'admin', label: '👑 Quản Trị & KPI', component: AdminScreen }
        ];
    }
  };

  const tabs = getTabsForRole();
  const [activeTab, setActiveTab] = useState<TabKey>(tabs[0]?.key || 'pos');

  const ActiveComponent = tabs.find(t => t.key === activeTab)?.component || tabs[0].component;

  const getRoleBadgeColor = () => {
    switch (user?.role) {
      case 'CASHIER':
        return { bg: isDark ? '#7C2D12' : '#FFEDD5', text: isDark ? '#FDBA74' : theme.secondary };
      case 'KITCHEN':
        return { bg: isDark ? '#075985' : '#E0F2FE', text: isDark ? '#7DD3FC' : '#0284C7' };
      case 'ADMIN':
        return { bg: isDark ? '#5B21B6' : '#EDE9FE', text: isDark ? '#C4B5FD' : '#7C3AED' };
      default:
        return { bg: isDark ? '#334155' : '#F1F5F9', text: isDark ? '#CBD5E1' : '#475569' };
    }
  };

  const badgeColor = getRoleBadgeColor();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Universal App Header */}
      <View style={[styles.topHeader, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <View style={styles.userSection}>
          <Text style={[styles.brandLogo, { color: theme.primary }]}>CRISPY BITE</Text>
          <View style={[styles.roleBadge, { backgroundColor: badgeColor.bg }]}>
            <Text style={[styles.roleBadgeText, { color: badgeColor.text }]}>{user?.role}</Text>
          </View>
          <Text style={[styles.userName, { color: theme.textMuted }]}>{user?.name}</Text>
        </View>

        <View style={styles.headerRightActions}>
          {/* Theme Mode Toggle Button */}
          <TouchableOpacity
            style={[
              styles.themeToggleBtn,
              { backgroundColor: isDark ? '#334155' : '#FEF3C7', borderColor: isDark ? '#475569' : '#FDE68A' }
            ]}
            onPress={toggleTheme}
            accessibilityLabel="Chuyển đổi giao diện Sáng / Tối"
          >
            <Text style={[styles.themeToggleText, { color: isDark ? '#F8FAFC' : '#B45309' }]}>
              {isDark ? '🌙 Tối' : '☀️ Sáng'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2' }]}
            onPress={logout}
          >
            <Text style={[styles.logoutText, { color: isDark ? '#FCA5A5' : theme.primary }]}>Đăng xuất ➔</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Screen Content */}
      <View style={styles.screenContainer}>
        <ActiveComponent />
      </View>

      {/* Role-Gated Bottom / Top Tab Bar */}
      {tabs.length > 1 && (
        <View style={[styles.tabBar, { backgroundColor: theme.tabBarBg, borderTopColor: theme.border }]}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabButton,
                  isActive && (isDark ? styles.tabButtonActiveDark : styles.tabButtonActiveLight)
                ]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    { color: isActive ? theme.primary : theme.textMuted },
                    isActive && styles.tabButtonTextActive
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  brandLogo: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.extraBold,
    letterSpacing: 1
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  userName: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  themeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1
  },
  themeToggleText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  logoutButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6
  },
  logoutText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  screenContainer: {
    flex: 1
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 8,
    minHeight: spacing.touchTargetMobile
  },
  tabButtonActiveLight: {
    backgroundColor: '#FEF2F2'
  },
  tabButtonActiveDark: {
    backgroundColor: '#1E293B'
  },
  tabButtonText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  tabButtonTextActive: {
    fontWeight: typography.weights.bold
  }
});
