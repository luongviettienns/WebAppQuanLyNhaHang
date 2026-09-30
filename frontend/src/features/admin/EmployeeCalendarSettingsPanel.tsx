import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EmployeeHolidayDto, EmployeeSettingsWorkspaceDto } from '../../api/employeeSettings';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { formatEmployeeSettingsDate, formatHolidayDuration } from './employeeSettingsViewModel';
import { EmployeeHolidayModal } from './EmployeeHolidayModal';
import { EmployeePolicyVersionModal } from './EmployeePolicyVersionModal';

const weekdayLabels = [['monday', 'T2'], ['tuesday', 'T3'], ['wednesday', 'T4'], ['thursday', 'T5'], ['friday', 'T6'], ['saturday', 'T7'], ['sunday', 'CN']] as const;
export const EmployeeCalendarSettingsPanel: React.FC<{ token: string | null; workspace: EmployeeSettingsWorkspaceDto; onSaved: () => void }> = ({ token, workspace, onSaved }) => {
  const { theme } = useTheme(); const [workweekOpen, setWorkweekOpen] = useState(false); const [holidayOpen, setHolidayOpen] = useState(false); const [selectedHoliday, setSelectedHoliday] = useState<EmployeeHolidayDto | null>(null);
  const policy = workspace.effectivePolicies.workweek;
  const openHoliday = (holiday?: EmployeeHolidayDto) => { setSelectedHoliday(holiday ?? null); setHolidayOpen(true); };
  return <View style={styles.stack}>
    <View style={[styles.panel, { backgroundColor: theme.surfaceBase }]}><View style={styles.header}><View><Text style={[styles.title, { color: theme.textPrimary }]}>Ngày làm việc</Text><Text style={[styles.help, { color: theme.textSecondary }]}>Thiết lập ngày làm việc chuẩn của chi nhánh</Text></View><Pressable testID="workweek-policy-add" onPress={() => setWorkweekOpen(true)} style={[styles.button, { borderColor: theme.primary }]}><Text style={{ color: theme.primary }}>Tạo phiên bản</Text></Pressable></View><View style={styles.days}>{weekdayLabels.map(([key, label]) => <View key={key} style={[styles.day, { backgroundColor: policy?.[key] ? theme.interactiveSecondary : theme.surfaceCanvas }]}><Text style={{ color: policy?.[key] ? theme.primary : theme.textSecondary }}>{label}</Text></View>)}</View></View>
    <View style={[styles.panel, { backgroundColor: theme.surfaceBase }]}><View style={styles.header}><View><Text style={[styles.title, { color: theme.textPrimary }]}>Ngày nghỉ/lễ</Text><Text style={[styles.help, { color: theme.textSecondary }]}>Dùng để cảnh báo lịch; MVP chưa tự cộng/trừ lương.</Text></View><Pressable testID="holiday-add" onPress={() => openHoliday()} style={[styles.button, { borderColor: theme.primary }]}><Text style={{ color: theme.primary }}>+ Thêm kỳ nghỉ</Text></Pressable></View>
      {workspace.holidays.length === 0 ? <Text style={[styles.empty, { color: theme.textSecondary }]}>Chưa có kỳ nghỉ/lễ</Text> : workspace.holidays.map(holiday => <Pressable key={holiday.id} testID={`holiday-row-${holiday.id}`} onPress={() => openHoliday(holiday)} style={[styles.holiday, { borderTopColor: theme.borderSubtle }]}><View><Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{holiday.name}</Text><Text style={[styles.help, { color: theme.textSecondary }]}>{formatEmployeeSettingsDate(holiday.startDate)} – {formatEmployeeSettingsDate(holiday.endDate)} · {formatHolidayDuration(holiday.startDate, holiday.endDate)}</Text></View><Text style={{ color: holiday.archivedAt ? theme.textSecondary : theme.primary }}>{holiday.archivedAt ? 'Đã lưu trữ' : 'Chỉnh sửa'}</Text></Pressable>)}
    </View>
    <EmployeePolicyVersionModal visible={workweekOpen} kind="workweek" token={token} workspace={workspace} onClose={() => setWorkweekOpen(false)} onSaved={onSaved} />
    <EmployeeHolidayModal visible={holidayOpen} token={token} workspace={workspace} holiday={selectedHoliday} onClose={() => setHolidayOpen(false)} onSaved={onSaved} />
  </View>;
};
const styles = StyleSheet.create({ stack: { gap: spacing.lg }, panel: { borderRadius: radii.lg, overflow: 'hidden' }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.xl }, title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg }, help: { fontFamily: typography.families.body, fontSize: typography.sizes.sm }, button: { borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.xl, paddingTop: 0 }, day: { alignItems: 'center', borderRadius: radii.pill, minWidth: 48, padding: spacing.sm }, empty: { padding: spacing.xl }, holiday: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.xl }, rowLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm } });
