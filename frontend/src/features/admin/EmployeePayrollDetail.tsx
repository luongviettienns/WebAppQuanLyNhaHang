import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  EmployeePayrollDetailDto,
  PayrollAdjustmentInput,
  PayrollPaymentInput
} from '../../api/employeePayroll';
import { useTheme } from '../../contexts/ThemeContext';
import {
  buildEmployeePayrollDetailModel,
  formatPayrollVnd
} from './employeePayrollViewModel';

interface EmployeePayrollDetailProps {
  detail: EmployeePayrollDetailDto;
  onChanged: () => Promise<void>;
  onRecalculate?: () => Promise<void>;
  onFinalize?: () => Promise<void>;
  onCancel?: (reason: string) => Promise<void>;
  onAdjust?: (lineId: number, input: PayrollAdjustmentInput) => Promise<void>;
  onPay?: (lineId: number, input: PayrollPaymentInput) => Promise<void>;
}

const newIdempotentClickGuard = () => ({ current: false });

export const EmployeePayrollDetail: React.FC<EmployeePayrollDetailProps> = ({
  detail,
  onChanged,
  onRecalculate,
  onFinalize,
  onCancel,
  onAdjust,
  onPay
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const model = useMemo(() => buildEmployeePayrollDetailModel(detail), [detail]);
  const [expandedLineId, setExpandedLineId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(newIdempotentClickGuard()).current;

  const run = async (action?: () => Promise<void>) => {
    if (!action || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      await action();
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể xử lý bảng lương');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const parsedAmount = Number(amount.replace(/[^0-9]/g, ''));

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{model.name}</Text>
          <Text style={styles.meta}>{model.code} · {detail.branch.name} · {model.status}</Text>
        </View>
        <View style={styles.actionRow}>
          {(detail.status === 'DRAFT' || detail.status === 'CALCULATED') && (
            <Pressable
              testID="payroll-action-recalculate"
              disabled={pending}
              onPress={() => run(onRecalculate)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Tính lại</Text>
            </Pressable>
          )}
          {detail.status === 'CALCULATED' && (
            <Pressable
              testID="payroll-action-finalize"
              disabled={pending}
              onPress={() => run(onFinalize)}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Chốt lương</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={[styles.sourceNotice, model.sourceState.tone === 'warning' && styles.sourceWarning]}>
        <Text style={styles.sourceTitle}>{model.sourceState.label}</Text>
        <Text style={styles.sourceText}>{model.sourceState.action}</Text>
      </View>

      <View style={styles.totalsRow}>
        {[
          ['Lương gộp', model.totals.gross],
          ['Điều chỉnh', model.totals.adjustment],
          ['Thực nhận', model.totals.net],
          ['Đã trả', model.totals.paid],
          ['Còn cần trả', model.totals.remaining]
        ].map(([label, value]) => (
          <View key={label} style={styles.totalItem}>
            <Text style={styles.totalLabel}>{label}</Text>
            <Text style={styles.totalValue}>{value}</Text>
          </View>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.employeeCell]}>Nhân viên</Text>
            <Text style={styles.cell}>Cách tính</Text>
            <Text style={styles.cell}>Thời gian thực tế</Text>
            <Text style={styles.moneyCell}>Thực nhận</Text>
            <Text style={styles.moneyCell}>Còn cần trả</Text>
          </View>
          {model.lines.map(line => {
            const expanded = expandedLineId === line.id;
            return (
              <View key={line.id}>
                <Pressable
                  testID={`payroll-line-${line.id}`}
                  onPress={() => setExpandedLineId(expanded ? null : line.id)}
                  style={[styles.row, expanded && styles.expandedRow]}
                >
                  <View style={[styles.cell, styles.employeeCell]}>
                    <Text style={styles.employeeName}>{line.raw.employeeName}</Text>
                    <Text style={styles.meta}>{line.raw.employeeCode} · {line.department}</Text>
                  </View>
                  <Text style={styles.cell}>{line.basis}</Text>
                  <Text style={styles.cell}>{line.actualTime}</Text>
                  <Text style={styles.moneyCell}>{line.net}</Text>
                  <Text style={styles.moneyCell}>{line.remaining}</Text>
                </Pressable>

                {expanded && (
                  <View style={styles.expandedPanel}>
                    <View style={styles.factGrid}>
                      <View style={styles.fact}>
                        <Text style={styles.factLabel}>Thời gian làm thực tế</Text>
                        <Text style={styles.factValue}>{line.actualTime}</Text>
                      </View>
                      <View style={styles.fact}>
                        <Text style={styles.factLabel}>Bối cảnh kế hoạch</Text>
                        <Text style={styles.factValue}>{`Ca theo lịch: ${line.raw.scheduledShifts}`}</Text>
                      </View>
                      <View style={styles.fact}>
                        <Text style={styles.factLabel}>Phiên hoàn tất</Text>
                        <Text style={styles.factValue}>{line.raw.completedSessions}</Text>
                      </View>
                      <View style={styles.fact}>
                        <Text style={styles.factLabel}>Lương gộp</Text>
                        <Text style={styles.factValue}>{line.gross}</Text>
                      </View>
                    </View>

                    {line.warnings.blockers.length > 0 && (
                      <View style={styles.warningBlock}>
                        <Text style={styles.warningTitle}>Cần xử lý</Text>
                        {line.warnings.blockers.map(item => <Text key={item.code} style={styles.warningText}>• {item.label}</Text>)}
                      </View>
                    )}
                    {line.warnings.information.length > 0 && (
                      <View style={styles.infoBlock}>
                        <Text style={styles.infoTitle}>Thông tin</Text>
                        {line.warnings.information.map(item => <Text key={item.code} style={styles.infoText}>• {item.label}</Text>)}
                      </View>
                    )}

                    {(detail.status === 'DRAFT' || detail.status === 'CALCULATED') && onAdjust && (
                      <View style={styles.formRow}>
                        <TextInput value={amount} onChangeText={setAmount} placeholder="Số tiền điều chỉnh" style={styles.input} keyboardType="numeric" />
                        <TextInput value={reason} onChangeText={setReason} placeholder="Lý do bắt buộc" style={styles.inputWide} />
                        <Pressable
                          disabled={pending || parsedAmount <= 0 || reason.trim().length < 3}
                          onPress={() => run(() => onAdjust(line.id, { type: 'BONUS', amount: parsedAmount, reason: reason.trim() }))}
                          style={styles.secondaryButton}
                        >
                          <Text style={styles.secondaryButtonText}>Thêm thưởng</Text>
                        </Pressable>
                      </View>
                    )}

                    {detail.status === 'FINALIZED' && (
                      <View style={styles.formRow}>
                        <TextInput value={amount} onChangeText={setAmount} placeholder={`Tối đa ${formatPayrollVnd(line.raw.remainingAmount)}`} style={styles.input} keyboardType="numeric" />
                        <Pressable
                          testID={`payroll-line-pay-${line.id}`}
                          disabled={pending || !onPay || parsedAmount <= 0 || parsedAmount > line.raw.remainingAmount}
                          onPress={() => run(() => onPay?.(line.id, { amount: parsedAmount, method: 'BANK_TRANSFER' }) ?? Promise.resolve())}
                          style={styles.primaryButton}
                        >
                          <Text style={styles.primaryButtonText}>Ghi nhận trả lương</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {detail.status !== 'CANCELLED' && detail.totalPaidAmount === 0 && onCancel && (
        <View style={styles.cancelRow}>
          <TextInput value={reason} onChangeText={setReason} placeholder="Lý do hủy bảng lương" style={styles.inputWide} />
          <Pressable disabled={pending || reason.trim().length < 3} onPress={() => run(() => onCancel(reason.trim()))} style={styles.dangerButton}>
            <Text style={styles.dangerText}>Hủy bảng lương</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { gap: 14, padding: 18, backgroundColor: theme.surfaceRaised, borderTopWidth: 1, borderColor: theme.borderSubtle },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1, gap: 3 }, title: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  meta: { color: theme.textSecondary, fontSize: 12 }, actionRow: { flexDirection: 'row', gap: 8 },
  sourceNotice: { padding: 12, backgroundColor: theme.interactiveSecondary, borderRadius: 8 },
  sourceWarning: { backgroundColor: '#fff4df' }, sourceTitle: { fontWeight: '700', color: theme.textPrimary },
  sourceText: { marginTop: 3, color: theme.textSecondary }, totalsRow: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: theme.borderSubtle, borderRadius: 8 },
  totalItem: { minWidth: 145, flexGrow: 1, padding: 12 }, totalLabel: { color: theme.textSecondary, fontSize: 12 },
  totalValue: { marginTop: 4, color: theme.textPrimary, fontWeight: '700' }, table: { minWidth: 930, flex: 1 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: theme.borderSubtle },
  headerRow: { minHeight: 42, backgroundColor: theme.surfaceSunken }, expandedRow: { backgroundColor: theme.interactiveSecondary },
  cell: { width: 170, paddingHorizontal: 12, color: theme.textPrimary }, employeeCell: { width: 250 }, moneyCell: { width: 160, paddingHorizontal: 12, textAlign: 'right', color: theme.textPrimary },
  employeeName: { color: theme.textPrimary, fontWeight: '600' }, expandedPanel: { padding: 16, gap: 12, backgroundColor: theme.surfaceCanvas },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, fact: { minWidth: 180, padding: 10, backgroundColor: theme.surfaceRaised, borderRadius: 6 },
  factLabel: { color: theme.textSecondary, fontSize: 12 }, factValue: { color: theme.textPrimary, fontWeight: '600', marginTop: 4 },
  warningBlock: { padding: 10, borderLeftWidth: 3, borderColor: theme.danger, backgroundColor: '#fff1f0' }, warningTitle: { fontWeight: '700', color: theme.danger }, warningText: { color: theme.textPrimary, marginTop: 3 },
  infoBlock: { padding: 10, borderLeftWidth: 3, borderColor: theme.primary, backgroundColor: theme.interactiveSecondary }, infoTitle: { fontWeight: '700', color: theme.primary }, infoText: { color: theme.textPrimary, marginTop: 3 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, input: { width: 190, padding: 10, borderWidth: 1, borderColor: theme.borderSubtle, borderRadius: 7, color: theme.textPrimary, backgroundColor: theme.surfaceRaised },
  inputWide: { minWidth: 240, flexGrow: 1, padding: 10, borderWidth: 1, borderColor: theme.borderSubtle, borderRadius: 7, color: theme.textPrimary, backgroundColor: theme.surfaceRaised },
  primaryButton: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.primary, borderRadius: 7 }, primaryButtonText: { color: theme.textInverse, fontWeight: '600' },
  secondaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.primary, borderRadius: 7 }, secondaryButtonText: { color: theme.primary, fontWeight: '600' },
  cancelRow: { flexDirection: 'row', gap: 8 }, dangerButton: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.danger, borderRadius: 7 }, dangerText: { color: theme.danger, fontWeight: '600' }, error: { color: theme.danger }
});
