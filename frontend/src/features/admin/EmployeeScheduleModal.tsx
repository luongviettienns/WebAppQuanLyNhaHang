import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import {
  createEmployeeScheduleBatchApi, createWorkShiftApi, deleteEmployeeScheduleRuleApi, patchEmployeeScheduleRuleApi,
  ScheduleApiError, type ScheduleCalendarWarningDto, type ScheduleOccurrenceDto, type ScheduleShiftDto, type ScheduleWeekEmployeeDto
} from '../../api/employeeScheduleManagement';
import { fetchEmployeesApi, type EmployeeListItemDto } from '../../api/employeeManagement';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, Field, InlineAlert, Surface } from '../../ui';
import { formatShiftTime } from './employeeScheduleViewModel';

interface EmployeeScheduleModalProps {
  visible: boolean;
  workDate: string;
  employeeId: number;
  employees: ScheduleWeekEmployeeDto[];
  shifts: ScheduleShiftDto[];
  occurrence?: ScheduleOccurrenceDto;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onShiftCreated: (shift: ScheduleShiftDto) => void;
}

type ScheduleEmployeeOption = Pick<EmployeeListItemDto, 'id' | 'code' | 'name' | 'status'>;

function minuteFromTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) return 1440;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
const scheduleIntentKey = () => `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const EmployeeScheduleModal: React.FC<EmployeeScheduleModalProps> = ({
  visible, workDate: initialDate, employeeId, employees, shifts, occurrence, onClose, onSaved, onShiftCreated
}) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { showToast } = useToast();
  const [workDate, setWorkDate] = useState(initialDate);
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([employeeId]);
  const [selectedEmployeeOptions, setSelectedEmployeeOptions] = useState<ScheduleEmployeeOption[]>([]);
  const [employeeSearchText, setEmployeeSearchText] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeePage, setEmployeePage] = useState(1);
  const [employeePageCount, setEmployeePageCount] = useState(1);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeListItemDto[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeLookupError, setEmployeeLookupError] = useState('');
  const [selectedShifts, setSelectedShifts] = useState<number[]>(occurrence ? [occurrence.shiftId] : []);
  const [repeatWeekly, setRepeatWeekly] = useState(occurrence?.recurrenceType === 'WEEKLY');
  const [endDate, setEndDate] = useState(occurrence?.ruleEndDate ?? '');
  const [scope, setScope] = useState<'occurrence' | 'following'>('occurrence');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [showNewShift, setShowNewShift] = useState(false);
  const [newShiftCode, setNewShiftCode] = useState('');
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('08:00');
  const [newShiftEnd, setNewShiftEnd] = useState('12:00');
  const [savingShift, setSavingShift] = useState(false);
  const [saveIntentKey, setSaveIntentKey] = useState(scheduleIntentKey);
  const [calendarWarnings, setCalendarWarnings] = useState<ScheduleCalendarWarningDto[]>([]);
  const isEditing = Boolean(occurrence);
  const defaultEmployeeOption = useMemo<ScheduleEmployeeOption | undefined>(() => {
    const employee = employees.find(value => value.id === employeeId);
    return employee ? { id: employee.id, code: employee.code, name: employee.name, status: employee.status } : undefined;
  }, [employeeId, employees]);
  const intentFingerprint = JSON.stringify({ workDate, selectedEmployees, selectedShifts, repeatWeekly, endDate });
  useEffect(() => {
    if (!visible || isEditing) return;
    setSaveIntentKey(scheduleIntentKey());
    setCalendarWarnings([]);
  }, [intentFingerprint, isEditing, visible]);

  useEffect(() => {
    if (!visible || !defaultEmployeeOption) return;
    setSelectedEmployeeOptions(current => {
      if (!selectedEmployees.includes(defaultEmployeeOption.id)) {
        return current.filter(option => option.id !== defaultEmployeeOption.id);
      }
      if (current.some(option => option.id === defaultEmployeeOption.id)) {
        return current.map(option => option.id === defaultEmployeeOption.id ? defaultEmployeeOption : option);
      }
      return [defaultEmployeeOption, ...current];
    });
  }, [defaultEmployeeOption, selectedEmployees, visible]);

  useEffect(() => {
    const timer = setTimeout(() => { setEmployeeSearch(employeeSearchText.trim()); setEmployeePage(1); }, 250);
    return () => clearTimeout(timer);
  }, [employeeSearchText]);

  useEffect(() => {
    if (!visible || isEditing) return;
    let cancelled = false;
    setLoadingEmployees(true); setEmployeeLookupError('');
    void fetchEmployeesApi(token, { status: 'WORKING', search: employeeSearch || undefined, page: employeePage, pageSize: 25 })
      .then(result => {
        if (cancelled) return;
        setEmployeeOptions(result.items);
        setEmployeePageCount(result.pagination.totalPages);
      })
      .catch(failure => {
        if (!cancelled) setEmployeeLookupError(failure instanceof Error ? failure.message : 'Không thể tải danh sách nhân viên');
      })
      .finally(() => { if (!cancelled) setLoadingEmployees(false); });
    return () => { cancelled = true; };
  }, [employeePage, employeeSearch, isEditing, token, visible]);

  const toggleEmployee = (employee: ScheduleEmployeeOption) => {
    setSelectedEmployees(current => current.includes(employee.id) ? current.filter(value => value !== employee.id) : [...current, employee.id]);
    setSelectedEmployeeOptions(current => current.some(value => value.id === employee.id)
      ? current.filter(value => value.id !== employee.id)
      : [...current, employee]);
  };
  const removeSelectedEmployee = (id: number) => {
    setSelectedEmployees(current => current.filter(value => value !== id));
    setSelectedEmployeeOptions(current => current.filter(value => value.id !== id));
  };
  const toggleShift = (id: number) => {
    setSelectedShifts(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };

  const save = async (calendarWarningAcknowledged = false) => {
    if (!workDate || selectedShifts.length === 0 || (!isEditing && selectedEmployees.length === 0)) return;
    setSaving(true); setError('');
    try {
      if (occurrence) {
        await patchEmployeeScheduleRuleApi(token, occurrence.ruleId, { workDate, scope, shiftIds: selectedShifts });
      } else {
        await createEmployeeScheduleBatchApi(token, {
          employeeIds: selectedEmployees, shiftIds: selectedShifts, startDate: workDate,
          repeatWeekly, endDate: repeatWeekly && endDate ? endDate : null,
          ...(calendarWarningAcknowledged ? { calendarWarningAcknowledged: true } : {})
        }, saveIntentKey);
      }
      await onSaved();
      showToast({ type: 'success', title: isEditing ? 'Đã cập nhật lịch' : 'Đã thêm lịch', message: `${selectedShifts.length} ca làm việc đã được lưu.` });
      onClose();
    } catch (failure) {
      if (failure instanceof ScheduleApiError && failure.code === 'SCHEDULE_CALENDAR_CONFIRMATION_REQUIRED') {
        const warnings = failure.details?.warnings;
        setCalendarWarnings(Array.isArray(warnings) ? warnings as ScheduleCalendarWarningDto[] : []);
        setError('Lịch có ngày nghỉ hoặc ngày lễ. Kiểm tra và xác nhận trước khi lưu.');
      } else setError(failure instanceof Error ? failure.message : 'Không thể lưu lịch làm việc');
    } finally { setSaving(false); }
  };

  const createShift = async () => {
    const startMinute = minuteFromTime(newShiftStart);
    const endMinute = minuteFromTime(newShiftEnd);
    if (!newShiftCode.trim() || !newShiftName.trim() || startMinute === null || endMinute === null || startMinute >= endMinute) {
      setError('Nhập mã ca, tên ca và khung giờ hợp lệ.'); return;
    }
    setSavingShift(true); setError('');
    try {
      const shift = await createWorkShiftApi(token, { code: newShiftCode.trim(), name: newShiftName.trim(), startMinute, endMinute });
      onShiftCreated(shift); setSelectedShifts(current => [...new Set([...current, shift.id])]);
      setShowNewShift(false); setNewShiftCode(''); setNewShiftName('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể tạo ca làm việc'); }
    finally { setSavingShift(false); }
  };

  const remove = async () => {
    if (!occurrence) return;
    setDeleting(true); setError('');
    try {
      await deleteEmployeeScheduleRuleApi(token, occurrence.ruleId, { workDate, scope });
      await onSaved();
      showToast({ type: 'success', title: 'Đã xóa lịch', message: 'Lịch được cập nhật.' });
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể xóa lịch làm việc'); }
    finally { setDeleting(false); }
  };

  const visibleEmployees: ScheduleEmployeeOption[] = isEditing
    ? employees.filter(employee => employee.id === occurrence?.employeeId).map(({ id, code, name, status }) => ({ id, code, name, status }))
    : [
        ...(defaultEmployeeOption && !employeeOptions.some(employee => employee.id === defaultEmployeeOption.id) ? [defaultEmployeeOption] : []),
        ...employeeOptions.map(({ id, code, name, status }) => ({ id, code, name, status }))
      ];

  return <Modal testID="employee-schedule-modal" visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Surface level="raised" style={[styles.dialog, elevation.modal, { backgroundColor: theme.surfaceBase }]}>
        <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{isEditing ? 'Sửa lịch làm việc' : 'Thêm lịch làm việc'}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{isEditing ? occurrence?.shiftName : 'Chọn nhân viên, ngày và ca làm việc.'}</Text>
          </View>
          <Pressable testID="schedule-modal-close" accessibilityRole="button" accessibilityLabel="Đóng lịch làm việc" onPress={onClose} style={styles.closeButton}>
            <AppIcon icon={X} color={theme.textSecondary} size={20} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error ? <InlineAlert title="Chưa thể lưu lịch" message={error} testID="schedule-modal-error" /> : null}
          {calendarWarnings.length > 0 && <View testID="schedule-calendar-warning" style={[styles.warningBox, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceSunken }]}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Ngày cần xác nhận</Text>
            {calendarWarnings.map((warning, index) => <Text key={`${warning.kind}-${warning.firstAffectedDate}-${index}`} style={[styles.helper, { color: theme.textSecondary }]}>
              {warning.kind === 'HOLIDAY' && warning.source.type === 'HOLIDAY' ? warning.source.name : 'Ngày nghỉ theo lịch làm việc'} · từ {warning.firstAffectedDate} · {warning.unbounded ? 'lặp không giới hạn' : `${warning.affectedCount ?? 0} lần`}
            </Text>)}
            <Button testID="schedule-confirm-calendar-warning" variant="secondary" label="Vẫn lưu lịch" onPress={() => void save(true)} loading={saving} />
          </View>}
          <Field testID="schedule-date" label="Ngày làm việc" value={workDate} onChangeText={setWorkDate} placeholder="YYYY-MM-DD" accessibilityLabel="Ngày làm việc" />

          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{isEditing ? 'Nhân viên' : 'Nhân viên áp dụng'}</Text>
            {!isEditing && <Text style={[styles.helper, { color: theme.textSecondary }]}>Chọn được nhân viên ở mọi trang</Text>}
          </View>
          {!isEditing && <Field testID="schedule-employee-search" label="Tìm nhân viên" value={employeeSearchText} onChangeText={setEmployeeSearchText} placeholder="Mã hoặc tên nhân viên" />}
          {!isEditing && employeeLookupError ? <InlineAlert title="Không thể tải nhân viên khác" message={employeeLookupError} testID="schedule-employee-picker-error" /> : null}
          {!isEditing && loadingEmployees && <View style={styles.employeeLoading}><ActivityIndicator color={theme.primary} /><Text style={[styles.helper, { color: theme.textSecondary }]}>Đang tải nhân viên…</Text></View>}
          {!isEditing && selectedEmployeeOptions.length > 0 && <View testID="schedule-selected-employees" style={styles.selectedEmployees}>
            {selectedEmployeeOptions.map(employee => <Pressable key={employee.id} testID={`schedule-selected-employee-${employee.id}`} accessibilityRole="button" accessibilityLabel={`Bỏ chọn ${employee.name}`} onPress={() => removeSelectedEmployee(employee.id)} style={[styles.selectedEmployeeChip, { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
              <Text style={[styles.choiceName, { color: theme.textPrimary }]}>{employee.name} ×</Text>
            </Pressable>)}
          </View>}
          <View style={styles.choiceList}>
            {visibleEmployees.map(employee => {
              const selected = selectedEmployees.includes(employee.id);
              return <Pressable
                key={employee.id} testID={`schedule-employee-${employee.id}`} accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: isEditing }} onPress={() => !isEditing && toggleEmployee(employee)}
                style={[styles.choice, { backgroundColor: selected ? theme.interactiveSecondary : theme.surfaceBase, borderColor: selected ? theme.primary : theme.borderSubtle }]}
              >
                <View style={[styles.checkbox, { borderColor: selected ? theme.primary : theme.borderStrong, backgroundColor: selected ? theme.primary : 'transparent' }]}>
                  {selected && <Text style={{ color: theme.textInverse }}>✓</Text>}
                </View>
                <Text style={[styles.choiceName, { color: theme.textPrimary }]}>{employee.name}</Text>
                <Text style={[styles.choiceCode, { color: theme.textSecondary }]}>{employee.code}</Text>
              </Pressable>;
            })}
          </View>
          {!isEditing && !loadingEmployees && visibleEmployees.length === 0 && <Text style={[styles.helper, { color: theme.textSecondary }]}>Không tìm thấy nhân viên đang làm việc.</Text>}
          {!isEditing && employeePageCount > 1 && <View style={styles.employeePager}>
            <Button testID="schedule-employee-page-previous" variant="quiet" label="Trang trước" disabled={employeePage <= 1 || loadingEmployees} onPress={() => setEmployeePage(value => Math.max(1, value - 1))} />
            <Text style={[styles.helper, { color: theme.textSecondary }]}>{employeePage}/{employeePageCount}</Text>
            <Button testID="schedule-employee-page-next" variant="quiet" label="Trang sau" disabled={employeePage >= employeePageCount || loadingEmployees} onPress={() => setEmployeePage(value => Math.min(employeePageCount, value + 1))} />
          </View>}

          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Chọn ca làm việc</Text>
            <Pressable testID="schedule-add-shift" accessibilityRole="button" onPress={() => setShowNewShift(value => !value)} style={styles.linkButton}>
              <AppIcon icon={Plus} color={theme.primary} size={16} />
              <Text style={[styles.linkText, { color: theme.primary }]}>{showNewShift ? 'Đóng tạo ca' : 'Thêm ca'}</Text>
            </Pressable>
          </View>
          <View style={styles.shiftGrid}>
            {shifts.filter(shift => shift.isActive).map(shift => {
              const selected = selectedShifts.includes(shift.id);
              return <Pressable
                key={shift.id} testID={`schedule-shift-${shift.id}`} accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }} onPress={() => toggleShift(shift.id)}
                style={[styles.shiftChoice, { backgroundColor: selected ? theme.interactiveSecondary : theme.surfaceSunken, borderColor: selected ? theme.primary : theme.borderSubtle }]}
              >
                <View style={[styles.checkbox, { borderColor: selected ? theme.primary : theme.borderStrong, backgroundColor: selected ? theme.primary : 'transparent' }]}>{selected && <Text style={{ color: theme.textInverse }}>✓</Text>}</View>
                <View style={styles.shiftCopy}>
                  <Text style={[styles.shiftName, { color: theme.textPrimary }]}>{shift.name}</Text>
                  <Text style={[styles.shiftTime, { color: theme.textSecondary }]}>{formatShiftTime(shift.startMinute, shift.endMinute)}</Text>
                </View>
              </Pressable>;
            })}
          </View>
          {showNewShift && <View style={[styles.newShiftPanel, { backgroundColor: theme.surfaceSunken }]}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Tạo ca mới</Text>
            <View style={styles.newShiftFields}>
              <Field testID="schedule-new-shift-code" label="Mã ca" value={newShiftCode} onChangeText={setNewShiftCode} placeholder="VD: CA_TRE" />
              <Field testID="schedule-new-shift-name" label="Tên ca" value={newShiftName} onChangeText={setNewShiftName} placeholder="Ca trễ" />
              <Field testID="schedule-new-shift-start" label="Bắt đầu" value={newShiftStart} onChangeText={setNewShiftStart} placeholder="08:00" />
              <Field testID="schedule-new-shift-end" label="Kết thúc" value={newShiftEnd} onChangeText={setNewShiftEnd} placeholder="12:00" />
            </View>
            <Button testID="schedule-create-shift" label="Lưu ca" onPress={() => void createShift()} loading={savingShift} />
          </View>}

          {!isEditing && <>
            <Pressable testID="schedule-repeat-toggle" accessibilityRole="switch" accessibilityState={{ checked: repeatWeekly }} onPress={() => setRepeatWeekly(value => !value)} style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Lặp lại hàng tuần</Text>
                <Text style={[styles.helper, { color: theme.textSecondary }]}>Lịch này áp dụng lại vào cùng thứ trong tuần.</Text>
              </View>
              <View style={[styles.toggle, { backgroundColor: repeatWeekly ? theme.primary : theme.borderStrong }]}><View style={[styles.toggleThumb, repeatWeekly && styles.toggleThumbOn]} /></View>
            </Pressable>
            {repeatWeekly && <Field testID="schedule-end-date" label="Ngày kết thúc (không bắt buộc)" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />}
          </>}

          {isEditing && occurrence?.recurrenceType === 'WEEKLY' && <View style={styles.scopeGroup}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Áp dụng thay đổi</Text>
            {(['occurrence', 'following'] as const).map(value => {
              const selected = scope === value;
              return <Pressable key={value} testID={`schedule-scope-${value}`} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setScope(value)} style={styles.scopeRow}>
                <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.borderStrong }]}>{selected && <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />}</View>
                <Text style={[styles.choiceName, { color: theme.textPrimary }]}>{value === 'occurrence' ? 'Chỉ ngày này' : 'Ngày này trở đi'}</Text>
              </Pressable>;
            })}
          </View>}

          {isEditing && <View style={styles.deleteArea}>
            {!confirmDelete ? <Button testID="schedule-delete-start" variant="danger" label="Xóa lịch" onPress={() => setConfirmDelete(true)} /> : <View style={[styles.deleteConfirm, { backgroundColor: theme.surfaceSunken }]}>
              <Text style={[styles.choiceName, { color: theme.textPrimary }]}>Xóa {scope === 'occurrence' ? 'ngày lịch này' : 'lịch từ ngày này trở đi'}?</Text>
              <Button testID="schedule-delete-confirm" variant="danger" label="Xác nhận xóa" onPress={() => void remove()} loading={deleting} />
              <Button testID="schedule-delete-cancel" variant="quiet" label="Giữ lịch" onPress={() => setConfirmDelete(false)} />
            </View>}
          </View>}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
          <Button testID="schedule-cancel" variant="quiet" label="Bỏ qua" onPress={onClose} disabled={saving || deleting} />
          <Button testID="schedule-save" variant="primary" label="Lưu lịch" onPress={() => void save()} loading={saving} disabled={selectedShifts.length === 0 || (!isEditing && selectedEmployees.length === 0) || !workDate || savingShift || deleting} />
        </View>
      </Surface>
    </View>
  </Modal>;
};

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(36, 33, 31, 0.60)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  dialog: { maxHeight: '92%', maxWidth: 760, overflow: 'hidden', width: '100%' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  subtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  closeButton: { alignItems: 'center', borderRadius: radii.md, justifyContent: 'center', minHeight: 44, minWidth: 44 },
  body: { gap: spacing.lg, padding: spacing.lg },
  sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  employeeLoading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  selectedEmployees: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  selectedEmployeeChip: { borderRadius: radii.pill, borderWidth: 1, minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  employeePager: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  helper: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  choiceList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  checkbox: { alignItems: 'center', borderRadius: radii.xs, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 },
  choiceName: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  choiceCode: { fontFamily: typography.families.operational, fontSize: typography.sizes.sm },
  linkButton: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.sm },
  linkText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  shiftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shiftChoice: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 64, minWidth: 220, padding: spacing.md },
  shiftCopy: { flex: 1, gap: 2 },
  shiftName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  shiftTime: { fontFamily: typography.families.operational, fontSize: typography.sizes.md },
  newShiftPanel: { borderRadius: radii.md, gap: spacing.md, padding: spacing.md },
  newShiftFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', minHeight: 52 },
  toggleCopy: { flex: 1, gap: spacing.xs },
  toggle: { borderRadius: radii.pill, height: 26, justifyContent: 'center', padding: 3, width: 46 },
  toggleThumb: { backgroundColor: '#FFFFFF', borderRadius: radii.pill, height: 20, width: 20 },
  toggleThumbOn: { alignSelf: 'flex-end' },
  scopeGroup: { gap: spacing.sm },
  scopeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 44 },
  radio: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 },
  radioDot: { borderRadius: radii.pill, height: 10, width: 10 },
  deleteArea: { alignItems: 'flex-start' },
  deleteConfirm: { alignSelf: 'stretch', borderRadius: radii.md, gap: spacing.sm, padding: spacing.md },
  warningBox: { borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md },
});
