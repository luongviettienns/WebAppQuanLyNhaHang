import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { AlertTriangle, BookOpen, Menu, Plus, Search, Users, UtensilsCrossed, X } from 'lucide-react-native';
import {
  activateCommissionPlanApi,
  assignCommissionOrderItemApi,
  archiveCommissionPlanApi,
  createCommissionEmployeeAssignmentApi,
  createCommissionPlanApi,
  createCommissionRuleApi,
  fetchCommissionAssigneesApi,
  fetchCommissionIssuesApi,
  fetchCommissionLedgerApi,
  fetchEmployeeCommissionWorkspaceApi,
  reassignCommissionOrderItemApi,
  resolveCommissionSaleBasisApi,
  retryCommissionIssueApi,
  type CommissionAssigneeDto,
  type CommissionEmployeeRowDto,
  type CommissionItemRowDto,
  type CommissionIssueDto,
  type CommissionLedgerRowDto,
  type CommissionPlanDto,
  type CommissionRuleType,
  type CommissionWorkspaceMode,
  type EmployeeCommissionWorkspaceDto
} from '../../api/employeeCommissions';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography, type ThemeColors } from '../../theme';
import { AppIcon } from '../../ui';
import { commissionEmptyState, formatCommissionMoney, formatCommissionRule } from './employeeCommissionViewModel';

const BRANCH_ID = 1;
const PAGE_SIZE = 25;
type Panel = 'matrix' | 'issues' | 'ledger';

const idempotencyKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const today = () => Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
const businessDate = () => { const parts = today(); return `${parts.year}-${parts.month}-${parts.day}`; };
const isBusinessDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const issueLabel = (code?: string) => ({ UNASSIGNED_EMPLOYEE: 'Chưa gán nhân viên', PLAN_MISSING: 'Chưa áp dụng bảng hoa hồng', PLAN_CONFLICT: 'Xung đột bảng hoa hồng', RULE_MISSING: 'Chưa có quy tắc', COST_MISSING: 'Thiếu giá vốn', RULE_CONFLICT: 'Xung đột quy tắc', LEDGER_CONFLICT: 'Xung đột sổ ghi nhận' }[code ?? ''] ?? code ?? 'Cần xử lý');

export const EmployeeCommissionScreen: React.FC = () => {
  const { token } = useAuth();
  const { employeeCommissionRevision } = useRestaurant();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState<CommissionWorkspaceMode>('ITEM');
  const [panel, setPanel] = useState<Panel>('matrix');
  const [queryText, setQueryText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EmployeeCommissionWorkspaceDto | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [issues, setIssues] = useState<CommissionIssueDto[]>([]);
  const [ledger, setLedger] = useState<CommissionLedgerRowDto[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [ruleTarget, setRuleTarget] = useState<{ item: CommissionItemRowDto; plan: CommissionPlanDto } | null>(null);
  const [ruleType, setRuleType] = useState<CommissionRuleType>('FIXED_PER_UNIT');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleEffectiveFrom, setRuleEffectiveFrom] = useState(businessDate());
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [planCode, setPlanCode] = useState('');
  const [planName, setPlanName] = useState('');
  const [planEffectiveFrom, setPlanEffectiveFrom] = useState(businessDate());
  const [planEffectiveTo, setPlanEffectiveTo] = useState('');
  const [assignmentTarget, setAssignmentTarget] = useState<{ employee: CommissionEmployeeRowDto; plan: CommissionPlanDto } | null>(null);
  const [assignmentEffectiveFrom, setAssignmentEffectiveFrom] = useState(businessDate());
  const [assignmentEffectiveTo, setAssignmentEffectiveTo] = useState('');
  const [assignmentAutoPos, setAssignmentAutoPos] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<CommissionLedgerRowDto | null>(null);
  const [resolutionTarget, setResolutionTarget] = useState<CommissionIssueDto | null>(null);
  const [resolutionValue, setResolutionValue] = useState('');
  const [resolutionReason, setResolutionReason] = useState('');
  const [resolutionRuleType, setResolutionRuleType] = useState<CommissionRuleType>('FIXED_PER_UNIT');
  const [assignees, setAssignees] = useState<CommissionAssigneeDto[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);
  const [bulkEmployeeId, setBulkEmployeeId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => { setSearch(queryText.trim()); setPage(1); }, 250);
    return () => clearTimeout(timeout);
  }, [queryText]);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true); setError('');
    try {
      const result = await fetchEmployeeCommissionWorkspaceApi(token, {
        branchId: BRANCH_ID, mode, search: search || undefined,
        planIds: selectedPlanId ? [selectedPlanId] : undefined, page, pageSize: PAGE_SIZE
      });
      if (current !== requestId.current) return;
      setData(result);
      setSelectedPlanId(previous => previous && result.plans.some(plan => plan.id === previous) ? previous : result.plans[0]?.id ?? null);
    } catch (caught) {
      if (current === requestId.current) setError(caught instanceof Error ? caught.message : 'Không thể tải bảng hoa hồng.');
    } finally { if (current === requestId.current) setLoading(false); }
  }, [mode, page, search, selectedPlanId, token]);

  useEffect(() => { void load(); }, [load, employeeCommissionRevision]);

  const openIssues = async () => {
    setPanel('issues'); setOperationsLoading(true); setError('');
    setSelectedIssueIds([]); setBulkEmployeeId(null);
    try {
      const [issueResult, assigneeResult] = await Promise.all([
        fetchCommissionIssuesApi(token, { branchId: BRANCH_ID, status: 'OPEN', page: 1, pageSize: 50 }),
        fetchCommissionAssigneesApi(token, BRANCH_ID)
      ]);
      setIssues(issueResult.rows); setAssignees(assigneeResult.assignees);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải hàng đợi.'); }
    finally { setOperationsLoading(false); }
  };
  const openLedger = async () => {
    setPanel('ledger'); setOperationsLoading(true); setError('');
    try { setLedger((await fetchCommissionLedgerApi(token, { branchId: BRANCH_ID, page: 1, pageSize: 50 })).rows); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải sổ hoa hồng.'); }
    finally { setOperationsLoading(false); }
  };
  const retryIssue = async (issueId: number) => {
    await retryCommissionIssueApi(token, issueId, idempotencyKey('commission-issue'));
    await openIssues(); await load();
  };
  const toggleIssue = (issueId: number) => {
    setSelectedIssueIds(current => current.includes(issueId) ? current.filter(id => id !== issueId) : [...current, issueId]);
  };
  const bulkAssign = async () => {
    if (!bulkEmployeeId || selectedIssueIds.length === 0) { setError('Chọn dòng món và nhân viên nhận hoa hồng.'); return; }
    const selected = issues.filter(issue => issue.type === 'UNASSIGNED_EMPLOYEE' && selectedIssueIds.includes(issue.id));
    setOperationsLoading(true); setError('');
    try {
      await Promise.all(selected.map(issue => assignCommissionOrderItemApi(token, issue.orderItemId, bulkEmployeeId)));
      await openIssues(); await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gán nhân viên cho các dòng đã chọn.');
      setOperationsLoading(false);
    }
  };
  const openRule = (item: CommissionItemRowDto, plan: CommissionPlanDto) => {
    const existing = item.rules[String(plan.id)];
    setRuleTarget({ item, plan }); setRuleType(existing?.type ?? 'FIXED_PER_UNIT');
    setRuleValue(existing?.type === 'FIXED_PER_UNIT' ? String(existing.fixedAmount ?? '') : existing ? String((existing.rateBps ?? 0) / 100) : '');
    setRuleEffectiveFrom(businessDate());
  };
  const saveRule = async () => {
    if (!ruleTarget) return;
    const number = Number(ruleValue.replace(',', '.'));
    if (!Number.isFinite(number) || number < 0) { setError('Mức hoa hồng phải là số không âm.'); return; }
    if (!isBusinessDate(ruleEffectiveFrom)) { setError('Nhập ngày áp dụng quy tắc theo định dạng YYYY-MM-DD.'); return; }
    await createCommissionRuleApi(token, ruleTarget.plan.id, {
      menuItemId: ruleTarget.item.id, type: ruleType, effectiveFrom: ruleEffectiveFrom,
      ...(ruleType === 'FIXED_PER_UNIT' ? { fixedAmount: Math.round(number), rateBps: null } : { fixedAmount: null, rateBps: Math.round(number * 100) })
    });
    setRuleTarget(null); await load();
  };
  const savePlan = async () => {
    if (!planCode.trim() || !planName.trim()) { setError('Nhập đủ mã và tên bảng hoa hồng.'); return; }
    if (!isBusinessDate(planEffectiveFrom) || (planEffectiveTo && (!isBusinessDate(planEffectiveTo) || planEffectiveTo < planEffectiveFrom))) { setError('Khoảng hiệu lực của bảng hoa hồng không hợp lệ.'); return; }
    await createCommissionPlanApi(token, { branchId: BRANCH_ID, code: planCode.trim(), name: planName.trim(), effectiveFrom: planEffectiveFrom, effectiveTo: planEffectiveTo || null });
    setPlanFormOpen(false); setPlanCode(''); setPlanName(''); await load();
  };
  const openAssignment = async (employee: CommissionEmployeeRowDto, plan: CommissionPlanDto) => {
    const existing = employee.assignments.find(item => item.planId === plan.id);
    setAssignmentTarget({ employee, plan }); setSelectedEmployeeId(employee.id);
    setAssignmentEffectiveFrom(businessDate()); setAssignmentEffectiveTo(''); setAssignmentAutoPos(existing?.autoAssignOwnPos ?? false);
  };
  const saveAssignment = async () => {
    if (!assignmentTarget) return;
    if (!isBusinessDate(assignmentEffectiveFrom) || (assignmentEffectiveTo && (!isBusinessDate(assignmentEffectiveTo) || assignmentEffectiveTo < assignmentEffectiveFrom))) { setError('Khoảng áp dụng nhân viên không hợp lệ.'); return; }
    await createCommissionEmployeeAssignmentApi(token, assignmentTarget.plan.id, { employeeId: assignmentTarget.employee.id, effectiveFrom: assignmentEffectiveFrom, effectiveTo: assignmentEffectiveTo || null, autoAssignOwnPos: assignmentAutoPos });
    setAssignmentTarget(null); await load();
  };
  const openReassign = async (entry: CommissionLedgerRowDto) => {
    setReassignTarget(entry); setReason(''); setSelectedEmployeeId(null);
    try { setAssignees((await fetchCommissionAssigneesApi(token, BRANCH_ID)).assignees); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải nhân viên nhận hoa hồng.'); }
  };
  const saveReassign = async () => {
    if (!reassignTarget?.orderItemId || !selectedEmployeeId || reason.trim().length < 3) { setError('Chọn nhân viên và nhập lý do điều chỉnh.'); return; }
    await reassignCommissionOrderItemApi(token, reassignTarget.orderItemId, { employeeId: selectedEmployeeId, reason: reason.trim(), idempotencyKey: idempotencyKey('commission-reassign') });
    setReassignTarget(null); await openLedger(); await load();
  };

  const openResolution = (issue: CommissionIssueDto) => {
    setResolutionTarget(issue); setResolutionValue(''); setResolutionReason(''); setResolutionRuleType('FIXED_PER_UNIT');
  };
  const saveResolution = async () => {
    if (!resolutionTarget || resolutionReason.trim().length < 3) { setError('Nhập giá trị và lý do xử lý.'); return; }
    const value = Number(resolutionValue.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) { setError('Giá trị xử lý phải là số không âm.'); return; }
    const isCost = resolutionTarget.type === 'COST_MISSING';
    await resolveCommissionSaleBasisApi(token, resolutionTarget.saleBasisId, {
      type: isCost ? 'COST_OVERRIDE' : 'RULE_OVERRIDE',
      resolution: isCost ? { unitCost: Math.round(value) } : {
        planId: selectedPlanId, type: resolutionRuleType,
        ...(resolutionRuleType === 'FIXED_PER_UNIT' ? { fixedAmount: Math.round(value), rateBps: null } : { fixedAmount: null, rateBps: Math.round(value * 100) })
      },
      reason: resolutionReason.trim(), idempotencyKey: idempotencyKey('commission-resolution')
    });
    setResolutionTarget(null); await openIssues(); await load();
  };

  const selectedPlan = data?.plans.find(plan => plan.id === selectedPlanId) ?? data?.plans[0];
  const visiblePlans = selectedPlan ? [selectedPlan] : (data?.plans ?? []);
  const planRail = <View testID={compact ? 'commission-filter-drawer' : 'commission-plan-rail'} style={[styles.planRail, compact && styles.drawer]}>
    <View style={styles.railHeading}><View><Text style={styles.eyebrow}>THIẾT LẬP</Text><Text style={styles.railTitle}>Bảng hoa hồng</Text></View>{compact && <Pressable accessibilityLabel="Đóng bộ lọc" onPress={() => setFiltersOpen(false)}><AppIcon icon={X} size={20} color={theme.textSecondary} /></Pressable>}</View>
    <Pressable testID="commission-plan-create" onPress={() => { setPlanEffectiveFrom(businessDate()); setPlanEffectiveTo(''); setPlanFormOpen(true); }} style={styles.addPlan}><AppIcon icon={Plus} size={16} color={theme.primary} /><Text style={styles.addPlanText}>Thêm bảng</Text></Pressable>
    {data?.plans.map(plan => <Pressable key={plan.id} testID={`commission-plan-${plan.id}`} accessibilityRole="radio" accessibilityState={{ selected: selectedPlanId === plan.id }} onPress={() => { setSelectedPlanId(plan.id); setPage(1); if (compact) setFiltersOpen(false); }} style={[styles.planItem, selectedPlanId === plan.id && styles.planItemSelected]}>
      <View style={[styles.planMarker, plan.status === 'ACTIVE' && styles.planMarkerActive]} />
      <View style={styles.planCopy}><Text style={styles.planName}>{plan.name}</Text><Text style={styles.meta}>{plan.status === 'ACTIVE' ? 'Đang áp dụng' : plan.status === 'DRAFT' ? 'Bản nháp' : 'Đã lưu trữ'}</Text></View>
    </Pressable>)}
    {selectedPlan && <View style={styles.planActions}>
      {selectedPlan.status === 'DRAFT' && <Pressable testID="commission-plan-activate" onPress={async () => { await activateCommissionPlanApi(token, selectedPlan.id); await load(); }}><Text style={styles.link}>Kích hoạt</Text></Pressable>}
      {selectedPlan.status === 'ACTIVE' && <Pressable testID="commission-plan-archive" onPress={async () => { await archiveCommissionPlanApi(token, selectedPlan.id, 'Ngừng áp dụng theo cấu hình quản trị'); await load(); }}><Text style={styles.linkDanger}>Lưu trữ</Text></Pressable>}
    </View>}
  </View>;

  const matrix = <View style={styles.matrixSurface}>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.matrixScroll}>
      <View style={styles.matrix}>
        <View style={[styles.matrixRow, styles.matrixHeader]}>
          <Text style={[styles.headerText, styles.codeColumn]}>{mode === 'ITEM' ? 'Mã hàng' : 'Mã NV'}</Text>
          <Text style={[styles.headerText, styles.nameColumn]}>{mode === 'ITEM' ? 'Tên hàng' : 'Nhân viên'}</Text>
          {mode === 'ITEM' && <Text style={[styles.headerText, styles.categoryColumn]}>Nhóm hàng</Text>}
          {visiblePlans.map(plan => <Text key={plan.id} style={[styles.headerText, styles.planColumn]}>{plan.name}</Text>)}
        </View>
        {(data?.rows ?? []).map(row => mode === 'ITEM' ? (() => {
          const item = row as CommissionItemRowDto;
          return <View key={item.id} testID={`commission-item-row-${item.id}`} style={styles.matrixRow}>
            <Text style={[styles.bodyText, styles.codeColumn]}>{item.sku}</Text><View style={styles.nameColumn}><Text style={styles.strongText}>{item.name}</Text><Text style={styles.meta}>{new Intl.NumberFormat('vi-VN').format(item.basePrice)}đ</Text></View>
            <Text style={[styles.bodyText, styles.categoryColumn]}>{item.categoryName}</Text>
            {visiblePlans.map(plan => <Pressable key={plan.id} testID={`commission-rule-${item.id}-${plan.id}`} onPress={() => openRule(item, plan)} style={[styles.planColumn, styles.ruleCell]}><Text style={item.rules[String(plan.id)] ? styles.ruleText : styles.mutedRule}>{formatCommissionRule(item.rules[String(plan.id)] ?? null)}</Text></Pressable>)}
          </View>;
        })() : (() => {
          const employee = row as CommissionEmployeeRowDto;
          return <View key={employee.id} testID={`commission-employee-row-${employee.id}`} style={styles.matrixRow}>
            <Text style={[styles.bodyText, styles.codeColumn]}>{employee.code}</Text><View style={styles.nameColumn}><Text style={styles.strongText}>{employee.name}</Text><Text style={styles.meta}>{employee.departmentName ?? 'Chưa phân bộ phận'}</Text></View>
            {visiblePlans.map(plan => { const assignment = employee.assignments.find(item => item.planId === plan.id); return <Pressable key={plan.id} testID={`commission-assignment-${employee.id}-${plan.id}`} onPress={() => void openAssignment(employee, plan)} style={[styles.planColumn, styles.ruleCell]}><Text style={assignment ? styles.ruleText : styles.mutedRule}>{assignment ? (assignment.autoAssignOwnPos ? 'Đã áp dụng · Tự gán POS' : 'Đã áp dụng') : 'Chưa áp dụng'}</Text></Pressable>; })}
          </View>;
        })())}
        {!loading && (data?.rows.length ?? 0) === 0 && <Text testID="commission-empty" style={styles.empty}>{commissionEmptyState(data?.pagination.total ?? 0, search) ?? 'Chưa có dữ liệu.'}</Text>}
      </View>
    </ScrollView>
    <View style={styles.pagination}><Text style={styles.meta}>{data?.pagination.total ?? 0} kết quả</Text><Pressable disabled={page <= 1} onPress={() => setPage(value => Math.max(1, value - 1))}><Text style={styles.link}>Trước</Text></Pressable><Text style={styles.bodyText}>{page}/{data?.pagination.totalPages ?? 1}</Text><Pressable disabled={page >= (data?.pagination.totalPages ?? 1)} onPress={() => setPage(value => value + 1)}><Text style={styles.link}>Sau</Text></Pressable></View>
  </View>;

  return <View style={[styles.screen, { backgroundColor: theme.surfaceCanvas }]}>
    <View style={styles.toolbar}>
      <View><Text style={styles.eyebrow}>NHÂN VIÊN</Text><Text style={styles.title}>Bảng hoa hồng</Text></View>
      <View style={styles.searchBox}><AppIcon icon={Search} size={17} color={theme.textSecondary} /><TextInput testID="commission-search" value={queryText} onChangeText={setQueryText} placeholder={mode === 'ITEM' ? 'Tìm mã, tên hàng hóa' : 'Tìm mã, tên nhân viên'} placeholderTextColor={theme.textSecondary} style={styles.searchInput} /></View>
      {compact && <Pressable testID="commission-filters-toggle" onPress={() => setFiltersOpen(value => !value)} style={styles.secondaryButton}><AppIcon icon={Menu} size={18} color={theme.textPrimary} /><Text style={styles.secondaryText}>Bảng</Text></Pressable>}
      <View style={styles.toolbarActions}>
        <Pressable testID="commission-open-issues" onPress={() => void openIssues()} style={styles.counterButton}><AppIcon icon={AlertTriangle} size={17} color={theme.warning} /><Text style={styles.secondaryText}>Chờ xử lý</Text><Text testID="commission-issues-count" style={styles.warningBadge}>{data?.issues.openCount ?? 0}</Text></Pressable>
        <Pressable testID="commission-open-ledger" onPress={() => void openLedger()} style={styles.counterButton}><AppIcon icon={BookOpen} size={17} color={theme.focusRing} /><Text style={styles.secondaryText}>Sổ ghi nhận</Text><Text style={styles.infoBadge}>{data?.ledger.total ?? 0}</Text></Pressable>
      </View>
    </View>
    <View style={styles.modeBar} accessibilityRole="tablist">
      <Pressable testID="commission-mode-item" accessibilityRole="tab" accessibilityState={{ selected: mode === 'ITEM' }} onPress={() => { if (mode !== 'ITEM') setData(null); setMode('ITEM'); setPanel('matrix'); setPage(1); }} style={[styles.modeTab, mode === 'ITEM' && styles.modeTabActive]}><AppIcon icon={UtensilsCrossed} size={17} color={mode === 'ITEM' ? theme.focusRing : theme.textSecondary} /><Text style={mode === 'ITEM' ? styles.modeTextActive : styles.modeText}>Theo hàng hóa</Text></Pressable>
      <Pressable testID="commission-mode-employee" accessibilityRole="tab" accessibilityState={{ selected: mode === 'EMPLOYEE' }} onPress={() => { if (mode !== 'EMPLOYEE') setData(null); setMode('EMPLOYEE'); setPanel('matrix'); setPage(1); }} style={[styles.modeTab, mode === 'EMPLOYEE' && styles.modeTabActive]}><AppIcon icon={Users} size={17} color={mode === 'EMPLOYEE' ? theme.focusRing : theme.textSecondary} /><Text style={mode === 'EMPLOYEE' ? styles.modeTextActive : styles.modeText}>Theo nhân viên</Text></Pressable>
    </View>
    <View style={styles.content}>
      {!compact && planRail}
      <View style={styles.main}>
        {error ? <Text testID="commission-error" style={styles.error}>{error}</Text> : null}
        {loading && !data ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : panel === 'matrix' ? matrix : <View style={styles.operations}>
          <View style={styles.operationsHeader}><View><Text style={styles.eyebrow}>{panel === 'issues' ? 'HÀNG ĐỢI' : 'LEDGER BẤT BIẾN'}</Text><Text style={styles.sectionTitle}>{panel === 'issues' ? 'Giao dịch cần xử lý' : 'Sổ ghi nhận hoa hồng'}</Text></View><Pressable onPress={() => setPanel('matrix')}><Text style={styles.link}>Về bảng cấu hình</Text></Pressable></View>
          {operationsLoading ? <ActivityIndicator color={theme.primary} /> : panel === 'issues' ? <>
            {issues.some(issue => issue.type === 'UNASSIGNED_EMPLOYEE') && <View style={styles.bulkBar}>
              <View style={styles.bulkAssignees}>{assignees.map(employee => <Pressable key={employee.id} testID={`commission-bulk-employee-${employee.id}`} onPress={() => setBulkEmployeeId(employee.id)} style={[styles.choice, bulkEmployeeId === employee.id && styles.choiceActive]}><Text style={styles.bodyText}>{employee.code} · {employee.name}</Text></Pressable>)}</View>
              <Pressable testID="commission-bulk-assign" disabled={!bulkEmployeeId || selectedIssueIds.length === 0} onPress={() => void bulkAssign()} style={[styles.primarySmall, (!bulkEmployeeId || selectedIssueIds.length === 0) && styles.disabled]}><Text style={styles.primaryText}>Gán {selectedIssueIds.length} dòng</Text></Pressable>
            </View>}
            {issues.map(issue => <View key={issue.id} testID={`commission-issue-${issue.id}`} style={styles.operationRow}>{issue.type === 'UNASSIGNED_EMPLOYEE' && <Pressable testID={`commission-issue-select-${issue.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIssueIds.includes(issue.id) }} onPress={() => toggleIssue(issue.id)} style={[styles.issueCheckbox, selectedIssueIds.includes(issue.id) && styles.issueCheckboxSelected]}><Text style={styles.checkboxMark}>{selectedIssueIds.includes(issue.id) ? '✓' : ''}</Text></Pressable>}<View style={styles.operationCopy}><Text style={styles.strongText}>{issueLabel(issue.type)}</Text><Text style={styles.meta}>Dòng món #{issue.orderItemId} · {issue.status}</Text></View>{['COST_MISSING', 'RULE_MISSING', 'RULE_CONFLICT'].includes(issue.type) && <Pressable testID={`commission-issue-resolve-${issue.id}`} onPress={() => openResolution(issue)} style={styles.secondarySmall}><Text style={styles.secondaryText}>Nhập căn cứ</Text></Pressable>}<Pressable testID={`commission-issue-retry-${issue.id}`} onPress={() => void retryIssue(issue.id)} style={styles.primarySmall}><Text style={styles.primaryText}>Thử lại</Text></Pressable></View>)}
          </> : ledger.map(entry => { const latestAllocation = entry.allocations.at(-1); return <View key={entry.id} testID={`commission-ledger-${entry.id}`} style={styles.operationRow}><View style={styles.operationCopy}><Text style={styles.strongText}>{entry.itemSnapshot.name ?? `Dòng món #${entry.orderItemId}`}</Text><Text style={styles.meta}>{entry.employeeSnapshot.name ?? `Nhân viên #${entry.employeeId}`} · {entry.type} · {entry.accountingDate.slice(0, 10)}</Text>{latestAllocation && latestAllocation.type !== 'RELEASED' ? <Text testID={`commission-ledger-allocation-${entry.id}`} style={styles.meta}>{latestAllocation.type === 'FINALIZED' ? 'Đã chốt' : 'Đã giữ'} · {latestAllocation.payrollBatch.code}</Text> : null}</View><Text testID={`commission-ledger-amount-${entry.id}`} style={[styles.amount, entry.commissionAmountDelta < 0 && styles.negative]}>{formatCommissionMoney(entry.commissionAmountDelta)}</Text><Pressable testID={`commission-ledger-reassign-${entry.id}`} onPress={() => void openReassign(entry)} style={styles.secondarySmall}><Text style={styles.secondaryText}>Đổi người</Text></Pressable></View>; })}
        </View>}
      </View>
    </View>
    {compact && filtersOpen && <View style={styles.drawerOverlay}><Pressable style={StyleSheet.absoluteFill as never} onPress={() => setFiltersOpen(false)} />{planRail}</View>}

    <Modal transparent visible={Boolean(ruleTarget)} onRequestClose={() => setRuleTarget(null)}><View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={styles.modalTitle}>Quy tắc · {ruleTarget?.item.name}</Text><Text style={styles.meta}>{ruleTarget?.plan.name}</Text><View style={styles.choiceRow}><Pressable testID="commission-rule-type-fixed" onPress={() => setRuleType('FIXED_PER_UNIT')} style={[styles.choice, ruleType === 'FIXED_PER_UNIT' && styles.choiceActive]}><Text style={styles.bodyText}>Cố định / món</Text></Pressable><Pressable testID="commission-rule-type-net" onPress={() => setRuleType('PERCENT_NET_REVENUE')} style={[styles.choice, ruleType === 'PERCENT_NET_REVENUE' && styles.choiceActive]}><Text style={styles.bodyText}>% doanh thu</Text></Pressable><Pressable testID="commission-rule-type-profit" onPress={() => setRuleType('PERCENT_GROSS_PROFIT')} style={[styles.choice, ruleType === 'PERCENT_GROSS_PROFIT' && styles.choiceActive]}><Text style={styles.bodyText}>% lợi nhuận</Text></Pressable></View><TextInput testID="commission-rule-rate" value={ruleValue} onChangeText={setRuleValue} keyboardType="decimal-pad" placeholder={ruleType === 'FIXED_PER_UNIT' ? 'Số tiền / món' : 'Tỷ lệ %'} style={styles.input} /><Text style={styles.fieldLabel}>Áp dụng từ</Text><TextInput testID="commission-rule-effective-from" value={ruleEffectiveFrom} onChangeText={setRuleEffectiveFrom} placeholder="YYYY-MM-DD" style={styles.input} /><View style={styles.modalActions}><Pressable onPress={() => setRuleTarget(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Hủy</Text></Pressable><Pressable testID="commission-rule-save" onPress={() => void saveRule()} style={styles.primaryButton}><Text style={styles.primaryText}>Lưu phiên bản mới</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={planFormOpen} onRequestClose={() => setPlanFormOpen(false)}><View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={styles.modalTitle}>Thêm bảng hoa hồng</Text><TextInput testID="commission-plan-code" value={planCode} onChangeText={setPlanCode} placeholder="Mã bảng" style={styles.input} /><TextInput testID="commission-plan-name" value={planName} onChangeText={setPlanName} placeholder="Tên bảng" style={styles.input} /><View style={styles.dateRow}><View style={styles.dateField}><Text style={styles.fieldLabel}>Hiệu lực từ</Text><TextInput testID="commission-plan-effective-from" value={planEffectiveFrom} onChangeText={setPlanEffectiveFrom} placeholder="YYYY-MM-DD" style={styles.input} /></View><View style={styles.dateField}><Text style={styles.fieldLabel}>Kết thúc (không bắt buộc)</Text><TextInput testID="commission-plan-effective-to" value={planEffectiveTo} onChangeText={setPlanEffectiveTo} placeholder="YYYY-MM-DD" style={styles.input} /></View></View><View style={styles.modalActions}><Pressable onPress={() => setPlanFormOpen(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Hủy</Text></Pressable><Pressable testID="commission-plan-save" onPress={() => void savePlan()} style={styles.primaryButton}><Text style={styles.primaryText}>Tạo bản nháp</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={Boolean(assignmentTarget)} onRequestClose={() => setAssignmentTarget(null)}><View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={styles.modalTitle}>Áp dụng {assignmentTarget?.plan.name}</Text><Text style={styles.bodyText}>{assignmentTarget?.employee.name} sẽ được nhận hoa hồng trong khoảng đã chọn.</Text><View style={styles.dateRow}><View style={styles.dateField}><Text style={styles.fieldLabel}>Áp dụng từ</Text><TextInput testID="commission-assignment-effective-from" value={assignmentEffectiveFrom} onChangeText={setAssignmentEffectiveFrom} placeholder="YYYY-MM-DD" style={styles.input} /></View><View style={styles.dateField}><Text style={styles.fieldLabel}>Kết thúc (không bắt buộc)</Text><TextInput testID="commission-assignment-effective-to" value={assignmentEffectiveTo} onChangeText={setAssignmentEffectiveTo} placeholder="YYYY-MM-DD" style={styles.input} /></View></View><Pressable testID="commission-assignment-auto-pos" accessibilityRole="checkbox" accessibilityState={{ checked: assignmentAutoPos }} onPress={() => setAssignmentAutoPos(value => !value)} style={styles.checkboxRow}><View style={[styles.issueCheckbox, assignmentAutoPos && styles.issueCheckboxSelected]}><Text style={styles.checkboxMark}>{assignmentAutoPos ? '✓' : ''}</Text></View><Text style={styles.bodyText}>Tự gán nhân viên này khi chính tài khoản liên kết tạo dòng món tại POS</Text></Pressable><View style={styles.modalActions}><Pressable onPress={() => setAssignmentTarget(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Hủy</Text></Pressable><Pressable testID="commission-assignment-save" onPress={() => void saveAssignment()} style={styles.primaryButton}><Text style={styles.primaryText}>Áp dụng</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={Boolean(resolutionTarget)} onRequestClose={() => setResolutionTarget(null)}><View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={styles.modalTitle}>{resolutionTarget?.type === 'COST_MISSING' ? 'Bổ sung giá vốn tại ngày bán' : 'Chọn quy tắc lịch sử'}</Text><Text style={styles.meta}>Giá trị này được lưu có dấu vết và chỉ áp dụng cho snapshot giao dịch gốc.</Text>{resolutionTarget?.type !== 'COST_MISSING' && <View style={styles.choiceRow}><Pressable onPress={() => setResolutionRuleType('FIXED_PER_UNIT')} style={[styles.choice, resolutionRuleType === 'FIXED_PER_UNIT' && styles.choiceActive]}><Text style={styles.bodyText}>Cố định / món</Text></Pressable><Pressable onPress={() => setResolutionRuleType('PERCENT_NET_REVENUE')} style={[styles.choice, resolutionRuleType === 'PERCENT_NET_REVENUE' && styles.choiceActive]}><Text style={styles.bodyText}>% doanh thu</Text></Pressable><Pressable onPress={() => setResolutionRuleType('PERCENT_GROSS_PROFIT')} style={[styles.choice, resolutionRuleType === 'PERCENT_GROSS_PROFIT' && styles.choiceActive]}><Text style={styles.bodyText}>% lợi nhuận</Text></Pressable></View>}<TextInput testID="commission-resolution-value" value={resolutionValue} onChangeText={setResolutionValue} keyboardType="decimal-pad" placeholder={resolutionTarget?.type === 'COST_MISSING' ? 'Giá vốn đơn vị tại ngày bán' : 'Mức hoa hồng'} style={styles.input} /><TextInput testID="commission-resolution-reason" value={resolutionReason} onChangeText={setResolutionReason} placeholder="Lý do và chứng từ đối chiếu" style={styles.input} /><View style={styles.modalActions}><Pressable onPress={() => setResolutionTarget(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Hủy</Text></Pressable><Pressable testID="commission-resolution-save" onPress={() => void saveResolution()} style={styles.primaryButton}><Text style={styles.primaryText}>Lưu căn cứ</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={Boolean(reassignTarget)} onRequestClose={() => setReassignTarget(null)}><View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={styles.modalTitle}>Điều chỉnh người hưởng</Text><Text style={styles.meta}>Không sửa entry cũ; hệ thống sẽ tạo cặp bút toán điều chỉnh.</Text><View style={styles.assignees}>{assignees.map(employee => <Pressable key={employee.id} testID={`commission-reassign-employee-${employee.id}`} onPress={() => setSelectedEmployeeId(employee.id)} style={[styles.choice, selectedEmployeeId === employee.id && styles.choiceActive]}><Text style={styles.bodyText}>{employee.code} · {employee.name}</Text></Pressable>)}</View><TextInput testID="commission-reassign-reason" value={reason} onChangeText={setReason} placeholder="Lý do điều chỉnh (bắt buộc)" style={styles.input} /><View style={styles.modalActions}><Pressable onPress={() => setReassignTarget(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Hủy</Text></Pressable><Pressable testID="commission-reassign-save" onPress={() => void saveReassign()} style={styles.primaryButton}><Text style={styles.primaryText}>Tạo điều chỉnh</Text></Pressable></View></View></View></Modal>
  </View>;
};

function createStyles(theme: ThemeColors) {
  const text = { color: theme.textPrimary, fontFamily: typography.families.body, fontSize: typography.sizes.sm };
  return StyleSheet.create({
    screen: { flex: 1, minHeight: 0 }, toolbar: { alignItems: 'center', backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, minHeight: 76, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, eyebrow: { color: theme.textSecondary, fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xs, letterSpacing: 1.1 }, title: { color: theme.textPrimary, fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl }, searchBox: { alignItems: 'center', borderColor: theme.borderSubtle, borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, minWidth: 230, paddingHorizontal: spacing.md }, searchInput: { ...text, flex: 1, minHeight: 42, outlineStyle: 'none' } as never, toolbarActions: { flexDirection: 'row', gap: spacing.sm }, counterButton: { alignItems: 'center', backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 42, paddingHorizontal: spacing.md }, warningBadge: { backgroundColor: '#FFF1DD', borderRadius: radii.pill, color: theme.warning, fontFamily: typography.families.bodyBold, minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, textAlign: 'center' }, infoBadge: { backgroundColor: '#E9F1FB', borderRadius: radii.pill, color: theme.focusRing, fontFamily: typography.families.bodyBold, minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, textAlign: 'center' }, modeBar: { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: spacing.lg }, modeTab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 3, flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.lg }, modeTabActive: { backgroundColor: '#F4F8FC', borderBottomColor: theme.focusRing }, modeText: { ...text, color: theme.textSecondary }, modeTextActive: { ...text, color: theme.focusRing, fontFamily: typography.families.bodySemibold }, content: { flex: 1, flexDirection: 'row', gap: spacing.md, minHeight: 0, padding: spacing.md }, planRail: { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, borderRadius: radii.lg, borderWidth: 1, minWidth: 236, padding: spacing.md, width: 250 }, drawer: { borderBottomLeftRadius: 0, borderTopLeftRadius: 0, height: '100%', width: 290 }, railHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }, railTitle: { color: theme.textPrimary, fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg }, addPlan: { alignItems: 'center', borderColor: theme.borderSubtle, borderRadius: radii.md, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, minHeight: 42, paddingHorizontal: spacing.md }, addPlanText: { color: theme.primary, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, planItem: { alignItems: 'center', borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, marginVertical: 2, minHeight: 52, paddingHorizontal: spacing.sm }, planItemSelected: { backgroundColor: '#EEF5FB' }, planMarker: { alignSelf: 'stretch', backgroundColor: theme.borderSubtle, borderRadius: radii.pill, width: 4 }, planMarkerActive: { backgroundColor: '#159A77' }, planCopy: { flex: 1 }, planName: { color: theme.textPrimary, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, planActions: { borderTopColor: theme.borderSubtle, borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.md }, main: { flex: 1, minHeight: 0 }, matrixSurface: { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, borderRadius: radii.lg, borderWidth: 1, flex: 1, minHeight: 0, overflow: 'hidden' }, matrixScroll: { flexGrow: 1 }, matrix: { minWidth: 850 }, matrixRow: { alignItems: 'center', borderBottomColor: theme.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', minHeight: 62, paddingHorizontal: spacing.md }, matrixHeader: { backgroundColor: '#EAF3FB', minHeight: 46 }, headerText: { color: '#174A7C', fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs, textTransform: 'uppercase' }, codeColumn: { width: 112 }, nameColumn: { width: 220 }, categoryColumn: { width: 150 }, planColumn: { minWidth: 180, paddingHorizontal: spacing.sm, width: 200 }, ruleCell: { alignItems: 'flex-start', borderLeftColor: theme.borderSubtle, borderLeftWidth: 1, justifyContent: 'center', minHeight: 62 }, ruleText: { color: '#126334', fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, mutedRule: { color: theme.textSecondary, fontFamily: typography.families.body, fontSize: typography.sizes.sm }, bodyText: text, strongText: { ...text, fontFamily: typography.families.bodySemibold }, meta: { color: theme.textSecondary, fontFamily: typography.families.body, fontSize: typography.sizes.xs }, fieldLabel: { color: theme.textSecondary, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs }, dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, dateField: { flex: 1, gap: spacing.xs, minWidth: 210 }, checkboxRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, empty: { color: theme.textSecondary, fontFamily: typography.families.body, padding: spacing.xxl, textAlign: 'center' }, pagination: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'flex-end', minHeight: 52, paddingHorizontal: spacing.md }, link: { color: theme.focusRing, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, linkDanger: { color: theme.danger, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, error: { backgroundColor: '#FCE9E7', borderColor: '#EBA8A2', borderRadius: radii.md, borderWidth: 1, color: theme.danger, fontFamily: typography.families.bodyMedium, marginBottom: spacing.sm, padding: spacing.md }, loader: { padding: spacing.xxl }, operations: { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, borderRadius: radii.lg, borderWidth: 1, flex: 1, minHeight: 0, padding: spacing.lg }, operationsHeader: { alignItems: 'center', borderBottomColor: theme.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: spacing.md }, sectionTitle: { color: theme.textPrimary, fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg }, bulkBar: { alignItems: 'center', backgroundColor: '#F4F8FC', borderBottomColor: theme.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.md }, bulkAssignees: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, operationRow: { alignItems: 'center', borderBottomColor: theme.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm }, operationCopy: { flex: 1 }, issueCheckbox: { alignItems: 'center', borderColor: theme.borderStrong, borderRadius: 4, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 }, issueCheckboxSelected: { backgroundColor: theme.interactivePrimary, borderColor: theme.interactivePrimary }, checkboxMark: { color: theme.textInverse, fontFamily: typography.families.bodyBold, fontSize: typography.sizes.xs }, amount: { color: theme.success, fontFamily: typography.families.operationalBold, fontSize: typography.sizes.md, fontVariant: ['tabular-nums'] }, negative: { color: theme.danger }, primarySmall: { backgroundColor: theme.interactivePrimary, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, disabled: { opacity: 0.45 }, secondarySmall: { borderColor: theme.borderSubtle, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, primaryButton: { alignItems: 'center', backgroundColor: theme.interactivePrimary, borderRadius: radii.md, justifyContent: 'center', minHeight: 42, paddingHorizontal: spacing.lg }, primaryText: { color: theme.textInverse, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, secondaryButton: { alignItems: 'center', backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 42, paddingHorizontal: spacing.md }, secondaryText: { color: theme.textPrimary, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, drawerOverlay: { backgroundColor: theme.overlay, bottom: 0, flexDirection: 'row', left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 }, modalOverlay: { alignItems: 'center', backgroundColor: theme.overlay, flex: 1, justifyContent: 'center', padding: spacing.lg }, modalCard: { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle, borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, maxWidth: 620, padding: spacing.xl, width: '100%' }, modalTitle: { color: theme.textPrimary, fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, choice: { borderColor: theme.borderSubtle, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, choiceActive: { backgroundColor: '#E9F1FB', borderColor: theme.focusRing }, input: { ...text, borderColor: theme.borderSubtle, borderRadius: radii.md, borderWidth: 1, minHeight: 44, outlineStyle: 'none', paddingHorizontal: spacing.md } as never, modalActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }, assignees: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }
  });
}
