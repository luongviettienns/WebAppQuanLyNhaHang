import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, typography, spacing } from '../theme';
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
          { key: 'kds', label: '🍳 Bếp KDS (Dark)', component: KDSScreen }
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
        return { bg: '#FFEDD5', text: colors.secondary };
      case 'KITCHEN':
        return { bg: '#E0F2FE', text: '#0284C7' };
      case 'ADMIN':
        return { bg: '#EDE9FE', text: '#7C3AED' };
      default:
        return { bg: '#F1F5F9', text: '#475569' };
    }
  };

  const badgeColor = getRoleBadgeColor();

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Universal App Header */}
      <View style={styles.topHeader}>
        <View style={styles.userSection}>
          <Text style={styles.brandLogo}>CRISPY BITE</Text>
          <View style={[styles.roleBadge, { backgroundColor: badgeColor.bg }]}>
            <Text style={[styles.roleBadgeText, { color: badgeColor.text }]}>{user?.role}</Text>
          </View>
          <Text style={styles.userName}>{user?.name}</Text>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Đăng xuất ➔</Text>
        </TouchableOpacity>
      </View>

      {/* Main Screen Content */}
      <View style={styles.screenContainer}>
        <ActiveComponent />
      </View>

      {/* Role-Gated Bottom / Top Tab Bar */}
      {tabs.length > 1 && (
        <View style={styles.tabBar}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
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
    flex: 1,
    backgroundColor: colors.background
  },
  topHeader: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  brandLogo: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.extraBold,
    color: colors.primary,
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
    color: colors.textMuted,
    fontWeight: typography.weights.medium
  },
  logoutButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#FEE2E2',
    borderRadius: 6
  },
  logoutText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.bold
  },
  screenContainer: {
    flex: 1
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  tabButtonActive: {
    backgroundColor: '#FEF2F2'
  },
  tabButtonText: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontWeight: typography.weights.medium
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.bold
  }
});
