import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CalendarDays, Clock3, Settings, WalletCards } from 'lucide-react-native';
import { fetchEmployeeSettingsApi, type EmployeeSettingsDestination, type EmployeeSettingsWorkspaceDto } from '../../api/employeeSettings';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, InlineAlert } from '../../ui';
import { EmployeeAttendanceSettingsPanel } from './EmployeeAttendanceSettingsPanel';
import { EmployeeCalendarSettingsPanel } from './EmployeeCalendarSettingsPanel';
import { EmployeePayrollSettingsPanel } from './EmployeePayrollSettingsPanel';
import { EmployeeSettingsInitializationPanel } from './EmployeeSettingsInitializationPanel';

type Section = 'initialization' | 'attendance' | 'payroll' | 'calendar';
const sections = [
  { key: 'initialization' as const, label: 'Khởi tạo', icon: Settings },
  { key: 'attendance' as const, label: 'Chấm công', icon: Clock3 },
  { key: 'payroll' as const, label: 'Tính lương', icon: WalletCards },
  { key: 'calendar' as const, label: 'Ngày làm & Nghỉ', icon: CalendarDays }
];

export const EmployeeSettingsScreen: React.FC<{ onNavigate: (destination: EmployeeSettingsDestination) => void }> = ({ onNavigate }) => {
  const { token } = useAuth(); const { theme } = useTheme(); const { width } = useWindowDimensions(); const compact = width < 820;
  const [section, setSection] = useState<Section>('initialization'); const [workspace, setWorkspace] = useState<EmployeeSettingsWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refreshNotice, setRefreshNotice] = useState('');
  const styles = useMemo(() => createStyles(), []);
  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true); setError('');
    try {
      const next = await fetchEmployeeSettingsApi(token, 1);
      if (background && workspace && JSON.stringify(next.revisions) !== JSON.stringify(workspace.revisions)) setRefreshNotice('Thiết lập đã được cập nhật. Bản nháp đang mở vẫn được giữ lại.');
      setWorkspace(next);
    } catch (failure) { setError((failure as Error).message || 'Không thể tải thiết lập nhân viên.'); }
    finally { if (!background) setLoading(false); }
  }, [token, workspace]);
  useEffect(() => { void load(); }, [token]); // load only when authenticated identity changes

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.primary} /><Text style={{ color: theme.textSecondary }}>Đang tải thiết lập…</Text></View>;
  if (!workspace) return <View style={styles.center}><InlineAlert message={error || 'Không thể tải thiết lập nhân viên.'} actionLabel="Thử lại" onAction={() => void load()} /></View>;

  const navigation = <View accessibilityRole="tablist" style={[compact ? styles.tabs : styles.sidebar, { backgroundColor: theme.surfaceBase }]}>{sections.map(item => <Pressable
    key={item.key} testID={`settings-nav-${item.key}`} accessibilityRole="tab" accessibilityState={{ selected: item.key === section }}
    onPress={() => setSection(item.key)} style={[styles.navItem, item.key === section && { backgroundColor: theme.interactiveSecondary }]}
  ><AppIcon icon={item.icon} color={item.key === section ? theme.primary : theme.textSecondary} size={18} /><Text style={[styles.navText, { color: item.key === section ? theme.primary : theme.textPrimary }]}>{item.label}</Text></Pressable>)}</View>;
  const panel = section === 'initialization'
    ? <EmployeeSettingsInitializationPanel workspace={workspace} onNavigate={onNavigate} />
    : section === 'attendance'
      ? <EmployeeAttendanceSettingsPanel token={token} workspace={workspace} onSaved={() => void load(true)} />
      : section === 'payroll'
        ? <EmployeePayrollSettingsPanel token={token} workspace={workspace} onSaved={() => void load(true)} onNavigate={onNavigate} />
        : <EmployeeCalendarSettingsPanel token={token} workspace={workspace} onSaved={() => void load(true)} />;
  return <View style={[styles.screen, { backgroundColor: theme.surfaceCanvas }]}>
    <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>Thiết lập nhân viên</Text>
    {compact ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{navigation}</ScrollView> : null}
    <View style={styles.layout}>{compact ? null : navigation}<ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
      {error ? <InlineAlert message={error} actionLabel="Thử lại" onAction={() => void load()} /> : null}
      {refreshNotice ? <InlineAlert tone="info" message={refreshNotice} /> : null}
      {panel}
    </ScrollView></View>
  </View>;
};

const createStyles = () => StyleSheet.create({
  screen: { flex: 1, minHeight: 0, padding: spacing.lg }, screenTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, marginBottom: spacing.lg },
  layout: { flex: 1, flexDirection: 'row', gap: spacing.md, minHeight: 0 }, sidebar: { borderRadius: radii.lg, minWidth: 248, padding: spacing.sm },
  tabs: { flexDirection: 'row', gap: spacing.xs, padding: spacing.xs }, navItem: { alignItems: 'center', borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.lg },
  navText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, content: { flex: 1 }, contentInner: { gap: spacing.md, paddingBottom: spacing.xxl },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xl }
});
