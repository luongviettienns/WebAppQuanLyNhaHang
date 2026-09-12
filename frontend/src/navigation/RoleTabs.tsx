import React, { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  ChefHat,
  LayoutGrid,
  LogOut,
  Moon,
  QrCode,
  ShieldCheck,
  ShoppingCart,
  Sun
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { radii, spacing, typography } from '../theme';
import { AppIcon, BrandMark, StatusBadge } from '../ui';
import { POSScreen } from '../features/pos/POSScreen';
import { TableScreen } from '../features/tables/TableScreen';
import { TableOrderScreen } from '../features/customer/TableOrderScreen';
import { KDSScreen } from '../features/kds/KDSScreen';
import { AdminScreen } from '../features/admin/AdminScreen';

type TabKey = 'pos' | 'tables' | 'qr_table' | 'kds' | 'admin';

interface TabItem {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  component: React.ComponentType;
}

const tabsByRole = {
  CASHIER: [
    { key: 'pos', label: 'Bán hàng', icon: ShoppingCart, component: POSScreen },
    { key: 'tables', label: 'Bàn', icon: LayoutGrid, component: TableScreen },
    { key: 'qr_table', label: 'Khách QR', icon: QrCode, component: TableOrderScreen }
  ],
  KITCHEN: [
    { key: 'kds', label: 'Bếp', icon: ChefHat, component: KDSScreen }
  ],
  ADMIN: [
    { key: 'pos', label: 'Bán hàng', icon: ShoppingCart, component: POSScreen },
    { key: 'tables', label: 'Bàn', icon: LayoutGrid, component: TableScreen },
    { key: 'qr_table', label: 'Khách QR', icon: QrCode, component: TableOrderScreen },
    { key: 'kds', label: 'Bếp', icon: ChefHat, component: KDSScreen },
    { key: 'admin', label: 'Quản trị', icon: ShieldCheck, component: AdminScreen }
  ]
} satisfies Record<string, TabItem[]>;

const roleLabels = {
  CASHIER: 'Thu ngân',
  KITCHEN: 'Bếp',
  ADMIN: 'Quản trị'
} as const;

interface NavigationItemsProps {
  tabs: TabItem[];
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
  vertical?: boolean;
}

const NavigationItems: React.FC<NavigationItemsProps> = ({ tabs, activeTab, onSelect, vertical = false }) => {
  const { theme } = useTheme();

  return (
    <View style={vertical ? styles.verticalNav : styles.horizontalNav}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            testID={`tab-${tab.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => onSelect(tab.key)}
            style={({ pressed }) => [
              vertical ? styles.railItem : styles.tabItem,
              { backgroundColor: active ? theme.interactiveSecondary : pressed ? theme.interactiveQuiet : 'transparent', borderColor: 'transparent' },
              active && { borderColor: theme.primary }
            ]}
          >
            <AppIcon icon={tab.icon} color={active ? theme.primary : theme.textSecondary} size={20} />
            <Text style={[styles.navLabel, { color: active ? theme.textPrimary : theme.textSecondary }]} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export const RoleTabs: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1200;
  const isMobile = width < 768;
  const tabs = useMemo(() => tabsByRole[user?.role || 'ADMIN'], [user?.role]);
  const [activeTab, setActiveTab] = useState<TabKey>(tabs[0]?.key || 'pos');
  const selected = tabs.find((tab) => tab.key === activeTab) || tabs[0];
  const ActiveComponent = selected.component;
  const roleLabel = roleLabels[user?.role || 'ADMIN'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[styles.commandBar, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.identity}>
          <BrandMark compact={isMobile} />
          {!isMobile && <View style={[styles.separator, { backgroundColor: theme.borderSubtle }]} />}
          <View style={styles.userCopy}>
            <StatusBadge tone={user?.role === 'KITCHEN' ? 'warning' : user?.role === 'ADMIN' ? 'info' : 'neutral'} label={roleLabel} />
            {!isMobile && <Text style={[styles.userName, { color: theme.textSecondary }]} numberOfLines={1}>{user?.name}</Text>}
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            onPress={toggleTheme}
            style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
          >
            <AppIcon icon={isDark ? Sun : Moon} color={theme.textPrimary} size={18} />
          </Pressable>
          <Pressable
            testID="btn-logout"
            accessibilityRole="button"
            accessibilityLabel="Đăng xuất"
            onPress={logout}
            style={({ pressed }) => [styles.logoutButton, { backgroundColor: pressed ? theme.surfaceSunken : 'transparent', borderColor: theme.borderSubtle }]}
          >
            <AppIcon icon={LogOut} color={theme.danger} size={18} />
            {!isMobile && <Text style={[styles.logoutLabel, { color: theme.danger }]}>Đăng xuất</Text>}
          </Pressable>
        </View>
      </View>

      {!isDesktop && !isMobile && tabs.length > 1 && (
        <View style={[styles.tabletNav, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
          <NavigationItems tabs={tabs} activeTab={selected.key} onSelect={setActiveTab} />
        </View>
      )}

      <View style={styles.workspace}>
        {isDesktop && tabs.length > 1 && (
          <View style={[styles.rail, { backgroundColor: theme.surfaceBase, borderRightColor: theme.borderSubtle }]}>
            <Text style={[styles.railHeading, { color: theme.textSecondary }]}>Khu vực làm việc</Text>
            <NavigationItems tabs={tabs} activeTab={selected.key} onSelect={setActiveTab} vertical />
          </View>
        )}
        <View style={styles.screenContainer}>
          <ActiveComponent />
        </View>
      </View>

      {isMobile && tabs.length > 1 && (
        <View style={[styles.bottomNav, { backgroundColor: theme.surfaceBase, borderTopColor: theme.borderSubtle }]}>
          <NavigationItems tabs={tabs} activeTab={selected.key} onSelect={setActiveTab} />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  commandBar: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  identity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  separator: { height: 32, width: 1 },
  userCopy: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  userName: { flexShrink: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  iconButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  logoutButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  logoutLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  workspace: { flex: 1, flexDirection: 'row' },
  screenContainer: { flex: 1, minWidth: 0 },
  tabletNav: { borderBottomWidth: 1, paddingHorizontal: spacing.md },
  rail: { borderRightWidth: 1, padding: spacing.md, width: 208 },
  railHeading: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  verticalNav: { gap: spacing.xs },
  horizontalNav: { flexDirection: 'row', gap: spacing.xs },
  railItem: { alignItems: 'center', borderLeftWidth: 3, borderRadius: radii.sm, flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md },
  tabItem: { alignItems: 'center', borderBottomWidth: 3, borderRadius: radii.sm, flex: 1, gap: 2, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  navLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  bottomNav: { borderTopWidth: 1, paddingHorizontal: spacing.xs },
});
