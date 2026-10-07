import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { ChannelReportScreen } from './ChannelReportScreen';
import { CustomerReportScreen } from './CustomerReportScreen';
import { DashboardScreen } from './DashboardScreen';
import { EmployeeReportScreen } from './EmployeeReportScreen';
import { EndOfDayReportScreen } from './EndOfDayReportScreen';
import { InventoryBalanceReportScreen } from './InventoryBalanceReportScreen';
import { ProfitAndLossReportScreen } from './ProfitAndLossReportScreen';
import { SupplierReportScreen } from './SupplierReportScreen';

export type ReportsWorkspaceSection = 'end-of-day' | 'sales' | 'goods' | 'customers' | 'suppliers' | 'employees' | 'channels' | 'finance';
const sections: { key: ReportsWorkspaceSection; label: string; disabled: boolean }[] = [
  { key: 'end-of-day', label: 'Cuối ngày', disabled: false },
  { key: 'sales', label: 'Bán hàng', disabled: false },
  { key: 'goods', label: 'Hàng hóa', disabled: false },
  { key: 'customers', label: 'Khách hàng', disabled: false },
  { key: 'suppliers', label: 'Nhà cung cấp', disabled: false },
  { key: 'employees', label: 'Nhân viên', disabled: false },
  { key: 'channels', label: 'Kênh bán hàng', disabled: false },
  { key: 'finance', label: 'Tài chính', disabled: false }
];

export const ReportsWorkspaceScreen: React.FC = () => {
  const { theme } = useTheme();
  const [section, setSection] = useState<ReportsWorkspaceSection>('end-of-day');
  return <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
    <ScrollView horizontal style={[styles.subnav, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]} contentContainerStyle={styles.tabs}>
      <View accessibilityRole="tablist" accessibilityLabel="Các báo cáo" style={styles.tablist}>
        {sections.map(item => <Pressable
          key={item.key}
          testID={`reports-workspace-${item.key}`}
          accessibilityRole="tab"
          accessibilityLabel={item.label}
          accessibilityHint={item.disabled ? 'Chưa khả dụng' : undefined}
          accessibilityState={{ selected: section === item.key, disabled: item.disabled }}
          disabled={item.disabled}
          onPress={item.disabled ? undefined : () => setSection(item.key)}
          style={[styles.tab, item.disabled && styles.disabled, section === item.key && { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}
        >
          <Text style={[styles.tabText, { color: section === item.key ? theme.textPrimary : theme.textSecondary }]}>{item.label}</Text>
        </Pressable>)}
      </View>
    </ScrollView>
    <View style={styles.content}>
      {section === 'sales' ? (
        <DashboardScreen />
      ) : section === 'goods' ? (
        <InventoryBalanceReportScreen />
      ) : section === 'customers' ? (
        <CustomerReportScreen />
      ) : section === 'suppliers' ? (
        <SupplierReportScreen />
      ) : section === 'employees' ? (
        <EmployeeReportScreen />
      ) : section === 'channels' ? (
        <ChannelReportScreen />
      ) : section === 'finance' ? (
        <ProfitAndLossReportScreen />
      ) : (
        <EndOfDayReportScreen />
      )}
    </View>
  </View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  subnav: { flexGrow: 0, borderBottomWidth: 1 },
  tabs: { paddingHorizontal: spacing.lg },
  tablist: { flexDirection: 'row' },
  tab: { justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.lg, borderBottomWidth: 3, borderBottomColor: 'transparent', borderTopLeftRadius: radii.sm, borderTopRightRadius: radii.sm },
  disabled: { opacity: 0.5 },
  tabText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  content: { flex: 1, minHeight: 0 },
});
