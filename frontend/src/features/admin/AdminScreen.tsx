import React, { useState } from 'react';
import { BarChart3, Utensils } from 'lucide-react-native';
import { Pressable, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon } from '../../ui';
import { MenuManagementScreen } from './MenuManagementScreen';
import { DashboardScreen } from '../reports/DashboardScreen';

type AdminTab = 'menu' | 'reports';

export const AdminScreen: React.FC = () => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<AdminTab>('menu');
  const isMobile = width < 768;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[styles.workspaceHeader, isMobile && styles.workspaceHeaderMobile, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Trung tâm quản trị</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Theo dõi thực đơn và hiệu quả ca bán hàng.</Text>
        </View>

        <View accessibilityRole="tablist" style={[styles.tabBar, isMobile && styles.tabBarMobile, { backgroundColor: theme.surfaceSunken }]}>
          <Pressable
            testID="admin-subtab-menu"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'menu' }}
            style={({ pressed }) => [styles.tabBtn, activeTab === 'menu' && { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }, pressed && { backgroundColor: theme.interactiveQuiet }]}
            onPress={() => setActiveTab('menu')}
          >
            <AppIcon icon={Utensils} color={activeTab === 'menu' ? theme.primary : theme.textSecondary} size={18} />
            <Text style={[styles.tabBtnText, { color: activeTab === 'menu' ? theme.primary : theme.textSecondary }]}>Thực đơn</Text>
          </Pressable>

          <Pressable
            testID="admin-subtab-reports"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'reports' }}
            style={({ pressed }) => [styles.tabBtn, activeTab === 'reports' && { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }, pressed && { backgroundColor: theme.interactiveQuiet }]}
            onPress={() => setActiveTab('reports')}
          >
            <AppIcon icon={BarChart3} color={activeTab === 'reports' ? theme.primary : theme.textSecondary} size={18} />
            <Text style={[styles.tabBtnText, { color: activeTab === 'reports' ? theme.primary : theme.textSecondary }]}>Báo cáo</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === 'menu' ? <MenuManagementScreen /> : <DashboardScreen />}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  workspaceHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  workspaceHeaderMobile: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: spacing.md
  },
  headingCopy: {
    flex: 1,
    gap: spacing.xs
  },
  title: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    lineHeight: typography.lineHeights.xl
  },
  subtitle: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm
  },
  tabBar: {
    alignSelf: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    width: 320
  },
  tabBarMobile: {
    alignSelf: 'stretch',
    width: '100%'
  },
  tabBtn: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: spacing.touchTargetMobile,
    paddingHorizontal: spacing.md
  },
  tabBtnText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  content: {
    flex: 1
  }
});
