import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { EmployeeSettingsDestination, EmployeeSettingsWorkspaceDto } from '../../api/employeeSettings';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { EmployeePolicyVersionModal } from './EmployeePolicyVersionModal';

export const EmployeePayrollSettingsPanel: React.FC<{ token: string | null; workspace: EmployeeSettingsWorkspaceDto; onSaved: () => void; onNavigate: (destination: EmployeeSettingsDestination) => void }> = ({ token, workspace, onSaved, onNavigate }) => {
  const { theme } = useTheme(); const [open, setOpen] = useState(false);
  const rows = [['automaticPayrollCreation', 'Tự động tạo bảng tính lương'], ['automaticPayrollRefresh', 'Tự động cập nhật bảng tính lương'], ['salaryTemplates', 'Mẫu lương'], ['tax', 'Thuế TNCN'], ['insurance', 'Bảo hiểm xã hội']] as const;
  return <View style={[styles.panel, { backgroundColor: theme.surfaceBase }]}>
    <View style={styles.header}><View><Text style={[styles.title, { color: theme.textPrimary }]}>Thiết lập tính lương</Text><Text style={[styles.help, { color: theme.textSecondary }]}>Công thức MVP giữ nguyên; thiết lập mới chỉ bổ sung metadata có phiên bản.</Text></View><Pressable testID="payroll-policy-add" onPress={() => setOpen(true)} style={[styles.button, { borderColor: theme.primary }]}><Text style={{ color: theme.primary }}>Tạo phiên bản</Text></Pressable></View>
    <View style={[styles.row, { borderTopColor: theme.borderSubtle }]}><View><Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Kỳ hạn trả lương</Text><Text style={[styles.help, { color: theme.textSecondary }]}>Hàng tháng · bắt đầu ngày 1</Text></View></View>
    <View style={[styles.row, { borderTopColor: theme.borderSubtle }]}><View><Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Lương theo giờ</Text><Text style={[styles.help, { color: theme.textSecondary }]}>Theo giờ chấm công thực tế</Text></View></View>
    {rows.map(([key, label]) => <View key={key} style={[styles.row, { borderTopColor: theme.borderSubtle }]}><View><Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text><Text style={[styles.help, { color: theme.textSecondary }]}>Chưa hỗ trợ trong MVP</Text></View><Switch disabled value={workspace.capabilities[key]} /></View>)}
    <Pressable onPress={() => onNavigate('employee-payroll')} style={[styles.cta, { borderTopColor: theme.borderSubtle }]}><Text style={{ color: theme.primary }}>Mở danh sách bảng lương</Text></Pressable>
    <EmployeePolicyVersionModal visible={open} kind="payroll" token={token} workspace={workspace} onClose={() => setOpen(false)} onSaved={onSaved} />
  </View>;
};
const styles = StyleSheet.create({ panel: { borderRadius: radii.lg, overflow: 'hidden' }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.xl }, title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg }, help: { fontFamily: typography.families.body, fontSize: typography.sizes.sm }, button: { borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, row: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 68, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }, rowLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, cta: { borderTopWidth: 1, padding: spacing.xl } });
