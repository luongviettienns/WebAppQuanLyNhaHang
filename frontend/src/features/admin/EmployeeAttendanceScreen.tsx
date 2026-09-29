import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Monitor, Search } from 'lucide-react-native';
import {
  createManualAttendanceSessionApi,
  fetchAttendanceExceptionsApi,
  fetchAttendanceWeekApi,
  markAttendanceAbsentApi,
  resolveAttendanceAbsenceConflictApi,
  updateAttendanceSessionApi,
  type AttendanceExceptionRowDto,
  type AttendanceExceptionState,
  type AttendanceReasonInput,
  type AttendanceWeekDto,
  type AttendanceWeekRowDto,
  type AttendanceSessionUpdateInput,
  type ManualAttendanceSessionInput,
  type MarkAttendanceAbsentInput
} from '../../api/employeeAttendance';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon } from '../../ui';
import { addWeeksToWeekStart, getBusinessDate, getMondayWeekStart } from './employeeScheduleViewModel';
import { buildAttendanceScreenModel } from './employeeAttendanceViewModel';
import { EmployeeAttendanceCorrectionModal } from './EmployeeAttendanceCorrectionModal';
import { EmployeeAttendanceKioskSessionsModal } from './EmployeeAttendanceKioskSessionsModal';

const BRANCH_ID = 1;
const PAGE_SIZE = 100;
type CorrectionKind = 'manual' | 'update' | 'absent' | 'resolve-conflict';
type CorrectionInput = ManualAttendanceSessionInput | AttendanceSessionUpdateInput | MarkAttendanceAbsentInput | AttendanceReasonInput;

interface EmployeeAttendanceScreenProps { initialWeekStart?: string }

function dateLabel(value: string) {
  const parts = value.split('-');
  return `${parts[2]}/${parts[1]}`;
}

function rowLabel(row: AttendanceExceptionRowDto) {
  if (row.exceptionType === 'NOT_CLOCKED') return 'Chưa chấm công';
  if (row.exceptionType === 'MISSING_CHECK_OUT') return 'Thiếu giờ ra / Cần xem xét';
  if (row.exceptionType === 'ABSENT_CONFIRMED') return 'Đã xác nhận vắng mặt';
  return 'Cần đối chiếu';
}

async function loadCompleteWeek(token: string | null, query: Parameters<typeof fetchAttendanceWeekApi>[1]): Promise<AttendanceWeekDto> {
  const firstPage = await fetchAttendanceWeekApi(token, { ...query, page: 1, pageSize: PAGE_SIZE });
  if (firstPage.pagination.totalPages <= 1) return firstPage;
  const remainingPages = await Promise.all(Array.from({ length: firstPage.pagination.totalPages - 1 }, (_, index) =>
    fetchAttendanceWeekApi(token, { ...query, page: index + 2, pageSize: PAGE_SIZE })));
  return { ...firstPage, rows: [ ...firstPage.rows, ...remainingPages.flatMap(page => page.rows) ] };
}

async function loadCompleteExceptions(token: string | null, query: Parameters<typeof fetchAttendanceExceptionsApi>[1]): Promise<AttendanceExceptionRowDto[]> {
  const firstPage = await fetchAttendanceExceptionsApi(token, { ...query, page: 1, pageSize: PAGE_SIZE });
  if (firstPage.pagination.totalPages <= 1) return firstPage.rows;
  const remainingPages = await Promise.all(Array.from({ length: firstPage.pagination.totalPages - 1 }, (_, index) =>
    fetchAttendanceExceptionsApi(token, { ...query, page: index + 2, pageSize: PAGE_SIZE })));
  return [ ...firstPage.rows, ...remainingPages.flatMap(page => page.rows) ];
}

export const EmployeeAttendanceScreen: React.FC<EmployeeAttendanceScreenProps> = ({ initialWeekStart }) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { employeeAttendanceRevision } = useRestaurant();
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const [weekStart, setWeekStart] = useState(() => getMondayWeekStart(initialWeekStart ?? getBusinessDate()));
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'shift' | 'employee'>('shift');
  const [data, setData] = useState<AttendanceWeekDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [kioskSessionsOpen, setKioskSessionsOpen] = useState(false);
  const [exceptionState, setExceptionState] = useState<AttendanceExceptionState>('OPEN');
  const [exceptions, setExceptions] = useState<AttendanceExceptionRowDto[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionsError, setExceptionsError] = useState('');
  const [correctionRow, setCorrectionRow] = useState<AttendanceWeekRowDto | null>(null);
  const [correctionKind, setCorrectionKind] = useState<CorrectionKind>('manual');
  const [saving, setSaving] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await loadCompleteWeek(token, { weekStart, branchId: BRANCH_ID, view, search: search || undefined });
      if (currentRequest === requestId.current) setData(result);
    } catch (failure) {
      if (currentRequest === requestId.current) setError(failure instanceof Error ? failure.message : 'Không thể tải bảng chấm công.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [search, token, view, weekStart]);

  const loadExceptions = useCallback(async (status = exceptionState) => {
    setExceptionsLoading(true);
    setExceptionsError('');
    try {
      const rows = await loadCompleteExceptions(token, { weekStart, branchId: BRANCH_ID, status, search: search || undefined });
      setExceptions(rows);
    } catch (failure) {
      setExceptionsError(failure instanceof Error ? failure.message : 'Không thể tải hàng đợi ngoại lệ.');
    } finally { setExceptionsLoading(false); }
  }, [exceptionState, search, token, weekStart]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (employeeAttendanceRevision > 0) void load(); }, [employeeAttendanceRevision, load]);
  useEffect(() => {
    const browserAvailable = typeof window !== 'undefined' && typeof document !== 'undefined';
    const refreshWhenFocused = () => { if (browserAvailable && document.visibilityState === 'visible') void load(); };
    if (browserAvailable) {
      window.addEventListener('focus', refreshWhenFocused);
      document.addEventListener('visibilitychange', refreshWhenFocused);
    }
    const appStateSubscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => {
      if (browserAvailable) {
        window.removeEventListener('focus', refreshWhenFocused);
        document.removeEventListener('visibilitychange', refreshWhenFocused);
      }
      appStateSubscription?.remove();
    };
  }, [load]);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchText]);
  useEffect(() => { if (exceptionsOpen) void loadExceptions(exceptionState); }, [exceptionState, exceptionsOpen, loadExceptions]);

  const openCorrection = (row: AttendanceWeekRowDto, kind?: CorrectionKind) => {
    setCorrectionRow(row);
    setCorrectionKind(kind ?? (row.sessions.length > 0 ? 'update' : 'manual'));
    setCorrectionError('');
  };

  const saveCorrection = async (input: CorrectionInput) => {
    if (!correctionRow) return;
    setSaving(true);
    setCorrectionError('');
    try {
      if (correctionKind === 'manual') {
        await createManualAttendanceSessionApi(token, input as ManualAttendanceSessionInput);
      } else if (correctionKind === 'resolve-conflict') {
        const dispositionId = correctionRow.disposition?.id;
        if (dispositionId === undefined) throw new Error('Không tìm thấy quyết định vắng mặt cần giải quyết.');
        await resolveAttendanceAbsenceConflictApi(token, dispositionId, input as AttendanceReasonInput);
      } else if (correctionKind === 'absent') {
        if (correctionRow.scheduleRuleId === null || correctionRow.scheduleDate === null) throw new Error('Không thể xác nhận vắng mặt khi hàng không gắn lịch ca.');
        await markAttendanceAbsentApi(token, correctionRow.scheduleRuleId, correctionRow.scheduleDate, input as MarkAttendanceAbsentInput);
      } else {
        const sessionId = correctionRow.sessions[0]?.id;
        if (!sessionId) throw new Error('Không tìm thấy phiên chấm công cần điều chỉnh.');
        await updateAttendanceSessionApi(token, sessionId, input as AttendanceSessionUpdateInput);
      }
      setCorrectionRow(null);
      await load();
      if (exceptionsOpen) await loadExceptions(exceptionState);
    } catch (failure) {
      setCorrectionError(failure instanceof Error ? failure.message : 'Không thể lưu thay đổi chấm công.');
    } finally { setSaving(false); }
  };

  const model = data ? buildAttendanceScreenModel(data) : null;
  const setWeekOffset = (offset: number) => setWeekStart(current => addWeeksToWeekStart(current, offset));

  const openExceptions = () => {
    setExceptionState('OPEN');
    setExceptionsOpen(true);
  };

  return <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
    <View style={[styles.toolbar, compact && styles.toolbarCompact]}>
      <View style={styles.titleBlock}>
        <Text style={[styles.heading, { color: theme.textPrimary }]}>Bảng chấm công</Text>
        <Text style={[styles.subheading, { color: theme.textSecondary }]}>Chi nhánh {model?.branchCode ?? 'MAIN'} · Giờ thực tế tách biệt với lịch ca</Text>
      </View>
      <View style={styles.searchBox}>
        <AppIcon icon={Search} color={theme.textSecondary} size={18} />
        <TextInput testID="attendance-search" value={searchText} onChangeText={setSearchText}
          placeholder="Tìm kiếm nhân viên" placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.textPrimary }]} />
      </View>
      <View style={styles.weekControls}>
        <Pressable testID="attendance-week-prev" accessibilityRole="button" accessibilityLabel="Tuần trước"
          onPress={() => setWeekOffset(-1)} style={[styles.iconButton, { borderColor: theme.borderSubtle }]}>
          <AppIcon icon={ChevronLeft} color={theme.textPrimary} size={18} />
        </Pressable>
        <View style={[styles.weekPill, { borderColor: theme.borderSubtle }]}>
          <AppIcon icon={CalendarDays} color={theme.textSecondary} size={16} />
          <Text style={[styles.controlText, { color: theme.textPrimary }]}>{dateLabel(weekStart)} – {dateLabel(model?.weekEnd ?? weekStart)}</Text>
        </View>
        <Pressable testID="attendance-week-next" accessibilityRole="button" accessibilityLabel="Tuần sau"
          onPress={() => setWeekOffset(1)} style={[styles.iconButton, { borderColor: theme.borderSubtle }]}>
          <AppIcon icon={ChevronRight} color={theme.textPrimary} size={18} />
        </Pressable>
        <Pressable testID="attendance-week-current" onPress={() => setWeekStart(getMondayWeekStart(getBusinessDate()))}
          style={[styles.secondaryButton, { borderColor: theme.borderSubtle }]}><Text style={[styles.controlText, { color: theme.textPrimary }]}>Tuần này</Text></Pressable>
      </View>
      <View style={styles.headerActions}>
        <View style={styles.viewSwitch}>
          <Pressable testID="attendance-view-shift" accessibilityRole="tab" accessibilityState={{ selected: view === 'shift' }}
            onPress={() => setView('shift')} style={[styles.switchOption, view === 'shift' && { backgroundColor: theme.interactiveSecondary }]}>
            <Text style={[styles.controlText, { color: view === 'shift' ? theme.primary : theme.textSecondary }]}>Xem theo ca</Text>
          </Pressable>
          <Pressable testID="attendance-view-employee" accessibilityRole="tab" accessibilityState={{ selected: view === 'employee' }}
            onPress={() => setView('employee')} style={[styles.switchOption, view === 'employee' && { backgroundColor: theme.interactiveSecondary }]}>
            <Text style={[styles.controlText, { color: view === 'employee' ? theme.primary : theme.textSecondary }]}>Xem theo nhân viên</Text>
          </Pressable>
        </View>
        <Pressable testID="attendance-open-exceptions" accessibilityRole="button" onPress={openExceptions}
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
          <AppIcon icon={ClipboardCheck} color="#FFFFFF" size={16} />
          <Text style={styles.primaryText}>Duyệt chấm công</Text>
        </Pressable>
        <Pressable testID="attendance-open-kiosk-sessions" accessibilityRole="button" onPress={() => setKioskSessionsOpen(true)}
          style={[styles.secondaryButton, { borderColor: theme.borderSubtle, flexDirection: 'row', gap: spacing.xs }]}>
          <AppIcon icon={Monitor} color={theme.textPrimary} size={16} />
          <Text style={[styles.controlText, { color: theme.textPrimary }]}>Thiết bị kiosk</Text>
        </Pressable>
      </View>
    </View>

    {exceptionsOpen && <View testID="attendance-exceptions-panel" style={[styles.exceptionPanel, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
      <View style={styles.panelHeader}>
        <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Ngoại lệ chấm công</Text>
        <View style={styles.panelActions}>
          {(['OPEN', 'RESOLVED'] as const).map(status => <Pressable key={status} testID={`attendance-exceptions-${status.toLowerCase()}`}
            onPress={() => setExceptionState(status)} style={[styles.secondaryButton, { borderColor: theme.borderSubtle, backgroundColor: exceptionState === status ? theme.interactiveSecondary : theme.surfaceBase }]}>
            <Text style={[styles.controlText, { color: theme.textPrimary }]}>{status === 'OPEN' ? 'Chưa xử lý' : 'Đã xử lý'}</Text>
          </Pressable>)}
          <Pressable testID="attendance-close-exceptions" onPress={() => setExceptionsOpen(false)} style={[styles.secondaryButton, { borderColor: theme.borderSubtle }]}>
            <Text style={[styles.controlText, { color: theme.textPrimary }]}>Đóng</Text>
          </Pressable>
        </View>
      </View>
      {exceptionsLoading ? <ActivityIndicator /> : exceptionsError ? <Text style={[styles.errorText, { color: '#B42318' }]}>{exceptionsError}</Text>
        : exceptions.length === 0 ? <Text style={[styles.muted, { color: theme.textSecondary }]}>Không có ngoại lệ phù hợp.</Text>
          : <ScrollView style={styles.exceptionList}>{exceptions.map(exception => <View key={`${exception.id}:${exception.exceptionType}`} style={[styles.exceptionRow, { borderTopColor: theme.borderSubtle }]}>
            <View style={styles.exceptionCopy}>
              <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>{exception.employee.name} · {exception.employee.code}</Text>
              <Text style={[styles.muted, { color: theme.textSecondary }]}>{dateLabel(exception.workDate)} · {rowLabel(exception)}</Text>
              {exception.disposition && <Text style={[styles.muted, { color: theme.textSecondary }]}>Lý do: {exception.disposition.reason}</Text>}
            </View>
            {exception.status === 'OPEN' && exception.exceptionType === 'NOT_CLOCKED' && <Pressable testID={`attendance-absent-${exception.id}`}
              onPress={() => openCorrection(exception, 'absent')} style={[styles.secondaryButton, { borderColor: theme.borderSubtle }]}>
              <Text style={[styles.controlText, { color: theme.textPrimary }]}>Xác nhận vắng</Text>
            </Pressable>}
            {exception.status === 'OPEN' && exception.sessions.length > 0 && <Pressable testID={`attendance-correct-${exception.id}`}
              onPress={() => openCorrection(exception, 'update')} style={[styles.secondaryButton, { borderColor: theme.borderSubtle }]}>
              <Text style={[styles.controlText, { color: theme.textPrimary }]}>Điều chỉnh</Text>
            </Pressable>}
            {exception.status === 'OPEN' && exception.exceptionType === 'REVIEW_CONFLICT' && exception.disposition && exception.sessions.length > 0 && <Pressable testID={`attendance-resolve-conflict-${exception.id}`}
              onPress={() => openCorrection(exception, 'resolve-conflict')} style={[styles.secondaryButton, { borderColor: theme.borderSubtle }]}>
              <Text style={[styles.controlText, { color: theme.textPrimary }]}>Giữ phiên thực tế</Text>
            </Pressable>}
          </View>)}</ScrollView>}
    </View>}

    <View style={[styles.legend, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
      <Text style={[styles.legendText, { color: theme.textSecondary }]}>✓ Đúng giờ</Text>
      <Text style={[styles.legendText, { color: '#854DFF' }]}>● Đi muộn / Về sớm</Text>
      <Text style={[styles.legendText, { color: '#C2410C' }]}>● Chưa chấm công</Text>
      <Text style={[styles.legendText, { color: '#64748B' }]}>● Nghỉ / Cần xem xét</Text>
    </View>
    <ScrollView style={styles.content} contentContainerStyle={styles.contentBody}>
      {loading ? <View style={styles.center}><ActivityIndicator /><Text style={[styles.muted, { color: theme.textSecondary }]}>Đang tải bảng chấm công…</Text></View>
        : error ? <Text accessibilityRole="alert" style={[styles.errorText, { color: '#B42318' }]}>{error}</Text>
          : !model || model.rows.length === 0 ? <View style={styles.center}>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Chưa có dữ liệu chấm công</Text>
            <Text style={[styles.muted, { color: theme.textSecondary }]}>Khi có lịch ca hoặc lượt chấm thực tế, dữ liệu sẽ xuất hiện tại đây.</Text>
          </View> : <ScrollView horizontal showsHorizontalScrollIndicator={compact} style={styles.gridScroll}>
            <View style={[styles.gridTable, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <View style={[styles.gridLine, styles.gridHeader, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.borderSubtle }]}>
                <View style={[styles.gridFirst, { borderRightColor: theme.borderSubtle }]}>
                  <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>{view === 'shift' ? 'Ca làm việc' : 'Nhân viên'}</Text>
                </View>
                {model.days.map(day => <View key={day.date} testID={`attendance-day-${day.date}`}
                  style={[styles.gridDayHeader, { backgroundColor: day.isWeekend ? theme.surfaceCanvas : theme.interactiveSecondary, borderRightColor: theme.borderSubtle }]}>
                  <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>{day.label}</Text>
                  <Text style={[styles.dayNumber, { color: theme.textPrimary }]}>{day.dayNumber}</Text>
                </View>)}
              </View>
              {model.groups.map(group => <View key={group.key} style={[styles.gridLine, styles.gridBodyLine, { borderBottomColor: theme.borderSubtle }]}>
                <View style={[styles.gridFirst, styles.gridGroup, { borderRightColor: theme.borderSubtle }]}>
                  <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>{group.title}</Text>
                  <Text style={[styles.muted, { color: theme.textSecondary }]}>{group.detail}</Text>
                </View>
                {model.days.map(day => <View key={`${group.key}:${day.date}`} style={[styles.gridCell, { borderRightColor: theme.borderSubtle }]}>
                  {group.rows.filter(row => row.workDate === day.date).map(row => <Pressable key={row.id} testID={`attendance-row-${row.id}`} accessibilityRole="button"
                    accessibilityLabel={`${row.employeeName}, ${row.workDate}, ${row.primaryStatus}; giờ vào ${row.checkIn}, giờ ra ${row.checkOut}`}
                    onPress={() => openCorrection(row.raw, row.raw.sessions.length > 0 ? 'update' : 'manual')}
                    style={[styles.attendanceTile, { backgroundColor: row.occurrenceStatus === 'NOT_CLOCKED' ? '#FFF4E5' : row.occurrenceStatus === 'ABSENT' ? '#F1F3F5' : theme.interactiveSecondary }]}>
                    <Text style={[styles.tileName, { color: theme.textPrimary }]}>{view === 'shift' ? `${row.employeeName} · ${row.employeeCode}` : row.shiftName}</Text>
                    <Text style={[styles.tileActual, { color: theme.textPrimary }]}>Vào {row.checkIn} · Ra {row.checkOut}</Text>
                    <Text style={[styles.tileStatus, { color: row.occurrenceStatus === 'NOT_CLOCKED' ? '#B45309' : row.occurrenceStatus === 'ABSENT' ? theme.textSecondary : theme.primary }]}>{row.primaryStatus}{row.deviation === '—' ? '' : ` · ${row.deviation}`}</Text>
                    {row.secondaryStatuses.map(status => <Text key={status} style={[styles.tileStatus, { color: '#B45309' }]}>{status}</Text>)}
                  </Pressable>)}
                </View>)}
              </View>)}
            </View>
          </ScrollView>}
    </ScrollView>

    <EmployeeAttendanceCorrectionModal visible={correctionRow !== null} kind={correctionKind} row={correctionRow}
      availableRows={data?.rows} saving={saving} error={correctionError}
      onCancel={() => setCorrectionRow(null)} onSubmit={saveCorrection} />
    <EmployeeAttendanceKioskSessionsModal visible={kioskSessionsOpen} branchId={BRANCH_ID}
      onClose={() => setKioskSessionsOpen(false)} />
  </View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between', paddingBottom: spacing.md },
  toolbarCompact: { alignItems: 'stretch', flexDirection: 'column' },
  titleBlock: { minWidth: 200 },
  heading: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.lg },
  subheading: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, marginTop: spacing.xs },
  searchBox: { alignItems: 'center', borderColor: '#D8D4CE', borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, height: 42, maxWidth: 280, minWidth: 190, paddingHorizontal: spacing.sm },
  searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.sm, minWidth: 0, outlineStyle: 'none' as never },
  weekControls: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  iconButton: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  weekPill: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, height: 40, paddingHorizontal: spacing.sm },
  secondaryButton: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: spacing.md },
  controlText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  headerActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  viewSwitch: { borderColor: '#D8D4CE', borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  switchOption: { justifyContent: 'center', minHeight: 38, paddingHorizontal: spacing.md },
  primaryButton: { alignItems: 'center', borderRadius: radii.sm, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing.md },
  primaryText: { color: '#FFFFFF', fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  content: { flex: 1, minHeight: 0 },
  contentBody: { gap: spacing.sm, paddingBottom: spacing.lg },
  gridScroll: { flex: 1, minHeight: 0 },
  gridTable: { alignSelf: 'flex-start', borderRadius: radii.sm, borderWidth: 1, minWidth: 210 + 7 * 132, overflow: 'hidden' },
  gridLine: { alignItems: 'stretch', flexDirection: 'row' },
  gridHeader: { borderBottomWidth: 1, minHeight: 52 },
  gridBodyLine: { borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 92 },
  gridFirst: { justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.md, width: 210 },
  gridGroup: { minHeight: 92 },
  gridDayHeader: { alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 52, width: 132 },
  gridCell: { borderRightWidth: StyleSheet.hairlineWidth, gap: spacing.xs, minHeight: 92, padding: spacing.xs, width: 132 },
  attendanceTile: { borderRadius: radii.sm, gap: 2, padding: spacing.xs },
  tileName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  tileActual: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  tileStatus: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  dayLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  dayNumber: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  group: { borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  groupHeader: { alignItems: 'baseline', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  groupTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 66, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  employeeCell: { flex: 1, minWidth: 140 },
  actualCell: { flex: 2, gap: spacing.xs, minWidth: 240 },
  rowTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  muted: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  editHint: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  center: { alignItems: 'center', gap: spacing.sm, justifyContent: 'center', minHeight: 220, padding: spacing.lg },
  emptyTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  errorText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, padding: spacing.md },
  legend: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'center', marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  legendText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  exceptionPanel: { borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.sm, maxHeight: 290, padding: spacing.md },
  panelHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  panelTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  panelActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  exceptionList: { flexGrow: 0 },
  exceptionRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', paddingVertical: spacing.sm },
  exceptionCopy: { flex: 1, gap: spacing.xs }
});
