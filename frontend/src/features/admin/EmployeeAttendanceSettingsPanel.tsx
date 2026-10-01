import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { EmployeeSettingsWorkspaceDto } from '../../api/employeeSettings';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { formatEmployeeSettingsMinutes } from './employeeSettingsViewModel';
import { EmployeePolicyVersionModal } from './EmployeePolicyVersionModal';

export const EmployeeAttendanceSettingsPanel: React.FC<{ token: string | null; workspace: EmployeeSettingsWorkspaceDto; onSaved: () => void }> = ({ token, workspace, onSaved }) => {
  const { theme } = useTheme(); const [open, setOpen] = useState(false); const policy = workspace.effectivePolicies.attendance;
  const unsupported = [['continuousShiftPunch', 'Một lượt Vào – Ra cho nhiều ca liên tục'], ['mobileAttendance', 'Chấm công trên điện thoại'], ['automaticAttendance', 'Tự động chấm công']] as const;
  return <View style={[styles.panel, { backgroundColor: theme.surfaceBase }]}>
    <View style={styles.header}><View><Text style={[styles.title, { color: theme.textPrimary }]}>Chế độ chấm công</Text><Text style={[styles.help, { color: theme.textSecondary }]}>Theo ca làm việc · thời gian thực tế do server ghi nhận</Text></View><Pressable testID="attendance-policy-add" onPress={() => setOpen(true)} style={[styles.button, { borderColor: theme.primary }]}><Text style={{ color: theme.primary }}>Tạo phiên bản</Text></Pressable></View>
    <View style={[styles.row, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Số giờ một ngày công chuẩn</Text><Text style={{ color: theme.textSecondary }}>{formatEmployeeSettingsMinutes(policy?.standardDayMinutes ?? 480)}</Text></View>
    <View style={[styles.row, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Đi muộn / về sớm</Text><Text style={{ color: theme.textSecondary }}>{policy?.lateThresholdMinutes ?? 0} phút / {policy?.earlyLeaveThresholdMinutes ?? 0} phút</Text></View>
    {unsupported.map(([key, label]) => <View key={key} style={[styles.row, { borderTopColor: theme.borderSubtle }]}><View><Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text><Text style={[styles.help, { color: theme.textSecondary }]}>Chưa hỗ trợ trong MVP</Text></View><Switch disabled value={workspace.capabilities[key]} /></View>)}
    <EmployeePolicyVersionModal visible={open} kind="attendance" token={token} workspace={workspace} onClose={() => setOpen(false)} onSaved={onSaved} />
  </View>;
};
const styles = StyleSheet.create({ panel: { borderRadius: radii.lg, overflow: 'hidden' }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.xl }, title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg }, help: { fontFamily: typography.families.body, fontSize: typography.sizes.sm }, button: { borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, row: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 68, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }, rowLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm } });
