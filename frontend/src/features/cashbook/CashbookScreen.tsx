import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ChevronUp, Download, Plus, RefreshCw, Settings2, X } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, Field, InlineAlert, ScreenHeader, Surface } from '../../ui';
import {
  activateCashbookApi, cancelCashVoucherApi, createCashbookAccountApi, createCashFlowCategoryApi, createCashVoucherApi, downloadCashbookExportApi,
  fetchCashbookApi, fetchCashbookCounterpartiesApi, fetchCashbookSettingsApi, type CashbookDirection, type CashbookFilter,
  type CashbookListDto, type CashVoucherDto, type CashbookSettingsDto, type CashFlowCategoryCreateInput, type FinancialAccountCreateInput, type ManualCashVoucherInput
} from '../../api/cashbook';
import { getCashbookSummaryCards, getVoucherRelationshipLabel, getVoucherSourceTypeLabel, getVoucherStatusLabel, formatVnd } from './cashbookViewModel';
import { ManualVoucherIdempotency } from './manualVoucherIdempotency';
import { printCashVoucher } from './cashbookPrint';

const keyStore = new ManualVoucherIdempotency();
const dateInput = () => {
  const local = new Date();
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
};
const paymentMethodLabels = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', CREDIT_CARD: 'Thẻ tín dụng', E_WALLET: 'Ví điện tử' } as const;
const accountTypeLabels = { CASH: 'Tiền mặt', BANK: 'Ngân hàng', E_WALLET: 'Ví điện tử' } as const;

export const CashbookScreen: React.FC = () => {
  const { token, user } = useAuth();
  const { cashbookRevision } = useRestaurant();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 800;
  const isAdmin = user?.role === 'ADMIN';
  const [settings, setSettings] = useState<CashbookSettingsDto | null>(null);
  const [result, setResult] = useState<CashbookListDto | null>(null);
  const [filter, setFilter] = useState<CashbookFilter>({ page: 1, pageSize: 25 });
  const [selected, setSelected] = useState<CashVoucherDto | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fromDateInput, setFromDateInput] = useState('');
  const [toDateInput, setToDateInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextSettings, nextResult] = await Promise.all([fetchCashbookSettingsApi(token), fetchCashbookApi(token, filter)]);
      setSettings(nextSettings);
      setResult(nextResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được Sổ quỹ.');
    } finally { setLoading(false); }
  }, [filter, token]);

  useEffect(() => { void reload(); }, [reload, cashbookRevision, refreshIndex]);

  const summary = useMemo(() => result ? getCashbookSummaryCards(result.balanceSummary, result.filteredSummary) : [], [result]);
  const activeAccounts = settings?.accounts.filter(account => account.isActive) ?? [];
  const categoriesFor = (direction: CashbookDirection) => settings?.categories.filter(category => category.isActive && !category.isSystem && category.direction === direction) ?? [];

  const submitVoucher = async (input: ManualCashVoucherInput) => {
    const key = keyStore.get(input);
    setSaving(true); setError('');
    try {
      await createCashVoucherApi(token, input, key);
      keyStore.complete(key);
      setComposerOpen(false);
      setRefreshIndex(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được phiếu. Có thể thử lại an toàn.'); }
    finally { setSaving(false); }
  };

  const cancelVoucher = async (voucher: CashVoucherDto) => {
    if (!isAdmin || voucher.status !== 'POSTED' || voucher.reversalOf || voucher.reversal) return;
    const reason = typeof window !== 'undefined' ? window.prompt('Lý do hủy phiếu (tối thiểu 3 ký tự):') : null;
    if (!reason?.trim()) return;
    setSaving(true); setError('');
    try {
      await cancelCashVoucherApi(token, voucher.id, reason.trim(), voucher.updatedAt);
      setRefreshIndex(value => value + 1);
      setSelected(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không hủy được phiếu.'); }
    finally { setSaving(false); }
  };

  const exportRows = async (format: 'csv' | 'xlsx') => {
    try {
      const blob = await downloadCashbookExportApi(token, filter, format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `so-quy.${format}`; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xuất được dữ liệu.'); }
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.surfaceCanvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Sổ quỹ" description="Theo dõi tiền thực thu, thực chi và số dư theo thời điểm."
          actions={<View style={styles.actions}>
            <Button label="Tải lại" variant="quiet" icon={RefreshCw} onPress={() => setRefreshIndex(value => value + 1)} />
            <Button label="CSV" variant="quiet" icon={Download} onPress={() => void exportRows('csv')} />
            <Button label="Xuất Excel" variant="secondary" icon={Download} onPress={() => void exportRows('xlsx')} />
            {isAdmin && <Button label="Cấu hình" variant="quiet" icon={Settings2} onPress={() => setSettingsOpen(true)} />}
            <Button label="Lập phiếu" icon={Plus} onPress={() => setComposerOpen(true)} disabled={!settings?.activatedAt} />
          </View>} />

        {error ? <InlineAlert message={error} /> : null}
        {settings && !settings.activatedAt && <Surface level="base" style={styles.notice}>
          <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>Sổ quỹ chưa được kích hoạt</Text>
          <Text style={[styles.subtle, { color: theme.textSecondary }]}>Quản trị viên cần khai báo số dư đầu kỳ trước khi ghi nhận phiếu.</Text>
          {isAdmin && <Button label="Thiết lập số dư đầu kỳ" onPress={() => setSettingsOpen(true)} />}
        </Surface>}

        <View style={[styles.summaryGrid, compact && styles.summaryGridCompact]}>
          {summary.map(card => <Surface key={card.key} style={[styles.summaryCard, card.key === 'balance' && styles.balanceCard]}>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>{card.label}</Text>
            <Text style={[styles.cardAmount, { color: card.key === 'payments' ? theme.danger : theme.textPrimary }]}>{formatVnd(card.amount)}</Text>
            <Text style={[styles.subtle, { color: theme.textSecondary }]}>{card.detail}</Text>
          </Surface>)}
        </View>

        <Surface level="base" style={styles.filterPanel}>
          <Field label="Tìm phiếu / đối tượng / nội dung" value={filter.search ?? ''} onChangeText={value => setFilter(current => ({ ...current, search: value, page: 1 }))} placeholder="VD: PT-..., tên nhà cung cấp" />
          <View style={[styles.filterRow, compact && styles.filterColumn]}>
            <Choice label="Loại chứng từ" value={filter.directions?.[0] ?? 'Tất cả'} options={['Tất cả', 'RECEIPT', 'PAYMENT']} onSelect={value => setFilter(current => ({ ...current, directions: value === 'Tất cả' ? undefined : [value as CashbookDirection], page: 1 }))} />
            <Choice label="Trạng thái" value={filter.statuses?.[0] === 'POSTED' ? 'Đã ghi sổ' : filter.statuses?.[0] === 'CANCELLED' ? 'Đã hủy' : 'Tất cả'} options={['Tất cả', 'Đã ghi sổ', 'Đã hủy']} onSelect={value => setFilter(current => ({ ...current, statuses: value === 'Tất cả' ? undefined : [value === 'Đã ghi sổ' ? 'POSTED' : 'CANCELLED'], page: 1 }))} />
            <Choice label="Tài khoản" value={activeAccounts.find(item => item.id === filter.accountIds?.[0])?.name ?? 'Tất cả'} options={['Tất cả', ...activeAccounts.map(item => item.name)]} onSelect={value => setFilter(current => ({ ...current, accountIds: value === 'Tất cả' ? undefined : [activeAccounts.find(item => item.name === value)!.id], page: 1 }))} />
            <Choice label="Danh mục" value={settings?.categories.find(item => item.id === filter.categoryIds?.[0])?.name ?? 'Tất cả'} options={['Tất cả', ...(settings?.categories.filter(item => item.isActive).map(item => item.name) ?? [])]} onSelect={value => setFilter(current => ({ ...current, categoryIds: value === 'Tất cả' ? undefined : [settings!.categories.find(item => item.name === value)!.id], page: 1 }))} />
            <Choice label="Kết quả kinh doanh" value={filter.affectsBusinessResult === undefined ? 'Tất cả' : filter.affectsBusinessResult ? 'Có ảnh hưởng' : 'Không ảnh hưởng'} options={['Tất cả', 'Có ảnh hưởng', 'Không ảnh hưởng']} onSelect={value => setFilter(current => ({ ...current, affectsBusinessResult: value === 'Tất cả' ? undefined : value === 'Có ảnh hưởng', page: 1 }))} />
            <Field label="Từ ngày" webType="date" value={fromDateInput} onChangeText={value => { setFromDateInput(value); const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`)); setFilter(current => ({ ...current, from: valid ? new Date(`${value}T00:00:00`).toISOString() : undefined, page: 1 })); }} placeholder="YYYY-MM-DD" />
            <Field label="Đến ngày" webType="date" value={toDateInput} onChangeText={value => { setToDateInput(value); const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`)); setFilter(current => ({ ...current, to: valid ? new Date(`${value}T23:59:59`).toISOString() : undefined, page: 1 })); }} placeholder="YYYY-MM-DD" />
          </View>
        </Surface>

        <Surface level="base" style={styles.tableSurface}>
          <View style={styles.tableHeading}><Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Chứng từ</Text><Text style={[styles.subtle, { color: theme.textSecondary }]}>{result?.filteredSummary.rowCount ?? 0} dòng phù hợp</Text></View>
          {loading ? <ActivityIndicator color={theme.primary} style={styles.loading} /> : result?.items.length ? result.items.map(voucher => {
            const relationship = getVoucherRelationshipLabel(voucher);
            return <Pressable key={voucher.id} onPress={() => setSelected(voucher)} style={({ pressed }) => [styles.row, { borderTopColor: theme.borderSubtle, backgroundColor: pressed ? theme.interactiveQuiet : 'transparent' }]}>
              <View style={styles.rowMain}>
                <View style={styles.rowTitleLine}><Text style={[styles.code, { color: theme.textPrimary }]}>{voucher.code}</Text><Text style={[styles.status, { color: voucher.status === 'POSTED' ? theme.success : theme.textSecondary }]}>{getVoucherStatusLabel(voucher.status)}</Text></View>
                <Text style={[styles.subtle, { color: theme.textSecondary }]}>{new Date(voucher.occurredAt).toLocaleString('vi-VN')} · {voucher.account?.name ?? `Quỹ #${voucher.accountId}`} · {voucher.category?.name ?? `Danh mục #${voucher.categoryId}`}</Text>
                {voucher.counterpartyName ? <Text style={[styles.subtle, { color: theme.textSecondary }]}>{voucher.counterpartyName}</Text> : null}
                {voucher.sourceCode || voucher.sourceInvoiceNumber ? <Text style={[styles.subtle, { color: theme.textSecondary }]}>{getVoucherSourceTypeLabel(voucher.sourceType)} · {voucher.sourceCode ?? 'Chưa có mã nguồn'}{voucher.sourceInvoiceNumber ? ` · HĐ ${voucher.sourceInvoiceNumber}` : ''}</Text> : null}
                {relationship ? <Text style={[styles.relationship, { color: theme.secondary }]}>{relationship}</Text> : null}
              </View>
              <Text style={[styles.amount, { color: voucher.direction === 'RECEIPT' ? theme.success : theme.danger }]}>{voucher.direction === 'RECEIPT' ? '+' : '−'}{formatVnd(voucher.amount)}</Text>
            </Pressable>;
          }) : <EmptyState title="Chưa có chứng từ" description="Phiếu thu, phiếu chi và các giao dịch tự động sẽ xuất hiện tại đây." />}
          {result && <View style={styles.pagination}>
            <Button label="Trước" variant="quiet" disabled={result.page <= 1} onPress={() => setFilter(current => ({ ...current, page: Math.max(1, (current.page ?? 1) - 1) }))} />
            <Text style={[styles.subtle, { color: theme.textSecondary }]}>Trang {result.page}</Text>
            <Button label="Sau" variant="quiet" disabled={result.items.length < result.pageSize} onPress={() => setFilter(current => ({ ...current, page: (current.page ?? 1) + 1 }))} />
          </View>}
        </Surface>
      </ScrollView>

      <VoucherComposer visible={composerOpen} saving={saving} accounts={activeAccounts} categoriesFor={categoriesFor}
        isAdmin={isAdmin} token={token} onClose={() => setComposerOpen(false)} onSubmit={submitVoucher} />
      <CashbookSettings visible={settingsOpen} settings={settings} saving={saving} onClose={() => setSettingsOpen(false)}
        onCreateAccount={async input => {
          setSaving(true); setError('');
          try { await createCashbookAccountApi(token, input); setRefreshIndex(value => value + 1); }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được tài khoản quỹ.'); }
          finally { setSaving(false); }
        }}
        onCreateCategory={async input => {
          setSaving(true); setError('');
          try { await createCashFlowCategoryApi(token, input); setRefreshIndex(value => value + 1); }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được danh mục.'); }
          finally { setSaving(false); }
        }}
        onActivate={async accounts => {
          setSaving(true); setError('');
          try { await activateCashbookApi(token, { accounts }); setSettingsOpen(false); setRefreshIndex(value => value + 1); }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'Không kích hoạt được Sổ quỹ.'); }
          finally { setSaving(false); }
        }} />
      <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.overlay}><Surface style={styles.dialog}>
          {selected && <>
            <View style={styles.dialogHeading}><Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{selected.code}</Text><Pressable onPress={() => setSelected(null)} accessibilityLabel="Đóng"><X color={theme.textPrimary} /></Pressable></View>
            <Text style={[styles.detailAmount, { color: selected.direction === 'RECEIPT' ? theme.success : theme.danger }]}>{formatVnd(selected.amount)}</Text>
            <DetailLine label="Trạng thái" value={getVoucherStatusLabel(selected.status)} />
            <DetailLine label="Ngày ghi nhận" value={new Date(selected.occurredAt).toLocaleString('vi-VN')} />
            <DetailLine label="Tài khoản" value={selected.account?.name ?? `Quỹ #${selected.accountId}`} />
            <DetailLine label="Danh mục" value={selected.category?.name ?? `Danh mục #${selected.categoryId}`} />
            <DetailLine label="Nghiệp vụ nguồn" value={getVoucherSourceTypeLabel(selected.sourceType)} />
            <DetailLine label="Chứng từ nguồn" value={selected.sourceCode ?? '—'} />
            <DetailLine label="Số hóa đơn" value={selected.sourceInvoiceNumber ?? '—'} />
            {selected.sourceInvoiceDate ? <DetailLine label="Ngày hóa đơn" value={new Date(selected.sourceInvoiceDate).toLocaleDateString('vi-VN')} /> : null}
            <DetailLine label="Đối tượng" value={selected.counterpartyName ?? '—'} />
            <DetailLine label="Nội dung" value={selected.note ?? '—'} />
            {getVoucherRelationshipLabel(selected) ? <Text style={[styles.relationship, { color: theme.secondary }]}>{getVoucherRelationshipLabel(selected)}</Text> : null}
            <Button label="In phiếu" variant="secondary" onPress={() => { if (!printCashVoucher(selected)) setError('Trình duyệt đã chặn cửa sổ in. Hãy cho phép popup rồi thử lại.'); }} />
            {isAdmin && selected.status === 'POSTED' && !selected.reversal && !selected.reversalOf && <Button label="Hủy và tạo bút toán đảo" variant="danger" onPress={() => void cancelVoucher(selected)} loading={saving} />}
            <Button label="Đóng" variant="quiet" onPress={() => setSelected(null)} />
          </>}
        </Surface></View>
      </Modal>
    </View>
  );
};

const Choice: React.FC<{
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  style?: any;
}> = ({ label, value, options, onSelect, style }) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const displayLabel = (item: string) => {
    if (item === 'RECEIPT') return 'Phiếu thu';
    if (item === 'PAYMENT') return 'Phiếu chi';
    return item;
  };

  return (
    <View style={[styles.choice, style]}>
      <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(current => !current)}
        style={[
          styles.choiceButton,
          {
            backgroundColor: theme.surfaceBase,
            borderColor: open ? theme.primary : theme.borderSubtle
          }
        ]}
      >
        <Text style={{ color: theme.textPrimary, flex: 1 }} numberOfLines={1}>
          {displayLabel(value)}
        </Text>
        <AppIcon icon={open ? ChevronUp : ChevronDown} color={theme.textSecondary} size={16} />
      </Pressable>
      {open && (
        <View style={[styles.optionsInline, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
          <ScrollView style={styles.optionsScroll} nestedScrollEnabled showsVerticalScrollIndicator={true}>
            {options.map(option => {
              const isSelected = option === value;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.optionItem,
                    {
                      backgroundColor: isSelected
                        ? theme.interactiveSecondary
                        : pressed
                        ? theme.interactiveQuiet
                        : 'transparent'
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      {
                        color: isSelected ? theme.primary : theme.textPrimary,
                        fontFamily: isSelected ? typography.families.bodySemibold : typography.families.body
                      }
                    ]}
                  >
                    {displayLabel(option)}
                  </Text>
                  {isSelected && <AppIcon icon={Check} color={theme.primary} size={16} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const VoucherComposer: React.FC<{
  visible: boolean;
  saving: boolean;
  accounts: CashbookSettingsDto['accounts'];
  categoriesFor: (direction: CashbookDirection) => CashbookSettingsDto['categories'];
  isAdmin: boolean;
  token: string | null;
  onClose: () => void;
  onSubmit: (input: ManualCashVoucherInput) => void;
}> = ({ visible, saving, accounts, categoriesFor, isAdmin, token, onClose, onSubmit }) => {
  const { theme } = useTheme();
  const [direction, setDirection] = useState<CashbookDirection>('RECEIPT');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<ManualCashVoucherInput['paymentMethod']>('CASH');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyType, setCounterpartyType] = useState<string | null>(null);
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [counterpartyMatches, setCounterpartyMatches] = useState<Array<{ id: number; name: string; type: string; phone?: string | null }>>([]);
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(dateInput());
  const [occurrenceTimeEdited, setOccurrenceTimeEdited] = useState(false);
  const [reason, setReason] = useState('');

  const categories = categoriesFor(direction);
  const paymentAccountType = paymentMethod === 'CASH' ? 'CASH' : paymentMethod === 'E_WALLET' ? 'E_WALLET' : 'BANK';
  const compatibleAccounts = accounts.filter(account => account.type === paymentAccountType);

  useEffect(() => {
    if (!visible) return;
    setAmount('');
    setCounterpartyName('');
    setCounterpartyType(null);
    setCounterpartyId(null);
    setCounterpartyMatches([]);
    setNote('');
    setCategoryId(null);
    setOccurredAt(dateInput());
    setOccurrenceTimeEdited(false);
    setReason('');
    setAccountId(accounts.find(item => item.isDefault)?.id ?? accounts[0]?.id ?? null);
  }, [visible, accounts]);

  useEffect(() => {
    if (!visible || compatibleAccounts.some(account => account.id === accountId)) return;
    setAccountId(compatibleAccounts.find(account => account.isDefault)?.id ?? compatibleAccounts[0]?.id ?? null);
  }, [accountId, compatibleAccounts, visible]);

  useEffect(() => {
    if (!visible || counterpartyName.trim().length < 2 || counterpartyId !== null) {
      setCounterpartyMatches([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void fetchCashbookCounterpartiesApi(token, counterpartyName, 1, 20)
        .then(result => { if (active) setCounterpartyMatches(result.items); })
        .catch(() => { if (active) setCounterpartyMatches([]); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [counterpartyId, counterpartyName, token, visible]);

  const numAmount = Number(amount) || 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <Surface style={styles.dialog}>
            <View style={styles.dialogHeading}>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Lập phiếu thu / chi</Text>
                <Text style={[styles.subtle, { color: theme.textSecondary }]}>Ghi nhận dòng tiền thực tế vào quỹ của nhà hàng</Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                style={({ pressed }) => [styles.closeIconBtn, { backgroundColor: pressed ? theme.surfaceSunken : 'transparent' }]}
              >
                <AppIcon icon={X} color={theme.textPrimary} size={20} />
              </Pressable>
            </View>

            {/* Loại chứng từ: 2 nút chuyển đổi trực quan (không che khuất) */}
            <View style={styles.formGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Loại chứng từ</Text>
              <View style={styles.directionToggleRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lập phiếu thu tiền vào"
                  onPress={() => { setDirection('RECEIPT'); setCategoryId(null); }}
                  style={[
                    styles.directionButton,
                    direction === 'RECEIPT'
                      ? { backgroundColor: '#EBFDF2', borderColor: '#12B76A' }
                      : { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }
                  ]}
                >
                  <AppIcon icon={ArrowDownLeft} color={direction === 'RECEIPT' ? '#12B76A' : theme.textSecondary} size={18} />
                  <Text style={[
                    styles.directionButtonText,
                    { color: direction === 'RECEIPT' ? '#027A48' : theme.textSecondary, fontFamily: direction === 'RECEIPT' ? typography.families.bodySemibold : typography.families.body }
                  ]}>
                    Phiếu thu (Tiền vào)
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lập phiếu chi tiền ra"
                  onPress={() => { setDirection('PAYMENT'); setCategoryId(null); }}
                  style={[
                    styles.directionButton,
                    direction === 'PAYMENT'
                      ? { backgroundColor: '#FEF3F2', borderColor: '#F04438' }
                      : { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }
                  ]}
                >
                  <AppIcon icon={ArrowUpRight} color={direction === 'PAYMENT' ? '#F04438' : theme.textSecondary} size={18} />
                  <Text style={[
                    styles.directionButtonText,
                    { color: direction === 'PAYMENT' ? '#B42318' : theme.textSecondary, fontFamily: direction === 'PAYMENT' ? typography.families.bodySemibold : typography.families.body }
                  ]}>
                    Phiếu chi (Tiền ra)
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Số tiền */}
            <View style={styles.formGroup}>
              <Field
                label="Số tiền (VND) *"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="Nhập số tiền thực thu / chi"
              />
              {numAmount > 0 && (
                <View style={[styles.amountBadge, { backgroundColor: direction === 'RECEIPT' ? '#EBFDF2' : '#FEF3F2' }]}>
                  <Text style={[styles.amountPreview, { color: direction === 'RECEIPT' ? '#027A48' : '#B42318' }]}>
                    {direction === 'RECEIPT' ? '+ ' : '− '}{formatVnd(numAmount)}
                  </Text>
                </View>
              )}
            </View>

            {/* Phương thức thanh toán: Choice Chips */}
            <View style={styles.formGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Phương thức thanh toán</Text>
              <View style={styles.methodChips}>
                {(Object.keys(paymentMethodLabels) as Array<keyof typeof paymentMethodLabels>).map(method => {
                  const active = paymentMethod === method;
                  return (
                    <Pressable
                      key={method}
                      onPress={() => setPaymentMethod(method)}
                      style={[
                        styles.methodChip,
                        {
                          backgroundColor: active ? theme.interactiveSecondary : theme.surfaceBase,
                          borderColor: active ? theme.primary : theme.borderSubtle
                        }
                      ]}
                    >
                      <Text style={[
                        styles.methodChipText,
                        {
                          color: active ? theme.primary : theme.textSecondary,
                          fontFamily: active ? typography.families.bodySemibold : typography.families.body
                        }
                      ]}>
                        {paymentMethodLabels[method]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Tài khoản quỹ */}
            <Choice
              label="Tài khoản quỹ *"
              value={compatibleAccounts.find(item => item.id === accountId)?.name ?? 'Chọn tài khoản phù hợp'}
              options={compatibleAccounts.map(item => item.name)}
              onSelect={value => setAccountId(compatibleAccounts.find(item => item.name === value)?.id ?? null)}
              style={styles.formGroup}
            />

            {/* Danh mục */}
            <Choice
              label={`Danh mục ${direction === 'RECEIPT' ? 'thu' : 'chi'} *`}
              value={categories.find(item => item.id === categoryId)?.name ?? 'Chọn danh mục'}
              options={categories.map(item => item.name)}
              onSelect={value => setCategoryId(categories.find(item => item.name === value)?.id ?? null)}
              style={styles.formGroup}
            />

            {/* Người nộp / nhận */}
            <View style={styles.formGroup}>
              <Field
                label="Người nộp / nhận"
                value={counterpartyName}
                onChangeText={value => {
                  setCounterpartyName(value);
                  setCounterpartyId(null);
                  setCounterpartyType(null);
                }}
                placeholder="Tìm tên, SĐT hoặc nhập mới (Khách hàng, NCC, Nhân viên)"
              />
              {!!counterpartyMatches.length && (
                <View style={[styles.counterpartyMatches, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                    {counterpartyMatches.map(match => (
                      <Pressable
                        key={`${match.type}-${match.id}`}
                        onPress={() => {
                          setCounterpartyName(match.name);
                          setCounterpartyId(match.id);
                          setCounterpartyType(match.type);
                          setCounterpartyMatches([]);
                        }}
                        style={({ pressed }) => [
                          styles.counterpartyOption,
                          {
                            backgroundColor: pressed ? theme.interactiveQuiet : 'transparent',
                            borderBottomColor: theme.borderSubtle
                          }
                        ]}
                      >
                        <Text style={{ color: theme.textPrimary, fontFamily: typography.families.bodySemibold }}>
                          {match.name}
                        </Text>
                        <Text style={[styles.subtle, { color: theme.textSecondary }]}>
                          {match.phone ? `${match.phone} · ` : ''}
                          {match.type === 'CUSTOMER' ? 'Khách hàng' : match.type === 'SUPPLIER' ? 'Nhà cung cấp' : match.type === 'EMPLOYEE' ? 'Nhân viên' : match.type}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Nội dung diễn giải */}
            <View style={styles.formGroup}>
              <Field
                label="Nội dung diễn giải"
                value={note}
                onChangeText={setNote}
                placeholder="Diễn giải chi tiết nghiệp vụ phát sinh"
              />
            </View>

            {/* Dành cho Quản trị viên: Ghi nhận lùi thời điểm */}
            {isAdmin && (
              <View style={[styles.adminTimePanel, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
                <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Ghi nhận thời điểm (Quản trị viên)</Text>
                <Field
                  label="Thời điểm phát sinh thực tế"
                  webType="datetime-local"
                  value={occurredAt}
                  onChangeText={value => {
                    setOccurredAt(value);
                    setOccurrenceTimeEdited(true);
                  }}
                  placeholder="YYYY-MM-DDTHH:mm"
                />
                <Field
                  label="Lý do ghi nhận"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Bắt buộc nêu lý do khi ghi lùi thời điểm"
                />
              </View>
            )}

            <Text style={[styles.subtle, { color: theme.textSecondary }]}>
              Phiếu chỉ được ghi nhận sau khi máy chủ xác nhận; thao tác lại cùng nội dung sẽ tự động chống trùng lặp an toàn.
            </Text>

            <View style={styles.modalActions}>
              <Button label="Hủy bỏ" variant="quiet" onPress={onClose} />
              <Button
                label="Ghi sổ phiếu"
                loading={saving}
                disabled={
                  !numAmount ||
                  !accountId ||
                  !categoryId ||
                  (isAdmin &&
                    (!occurredAt ||
                      Number.isNaN(new Date(occurredAt).getTime()) ||
                      (occurrenceTimeEdited &&
                        new Date(occurredAt).getTime() < Date.now() &&
                        reason.trim().length < 3)))
                }
                onPress={() =>
                  onSubmit({
                    direction,
                    amount: numAmount,
                    accountId: accountId!,
                    categoryId: categoryId!,
                    paymentMethod,
                    counterpartyType,
                    counterpartyId,
                    counterpartyName: counterpartyName.trim() || null,
                    note: note.trim() || null,
                    ...(isAdmin && occurrenceTimeEdited
                      ? {
                          occurredAt: new Date(occurredAt).toISOString(),
                          reason: reason.trim() || undefined,
                        }
                      : {}),
                  })
                }
              />
            </View>
          </Surface>
        </ScrollView>
      </View>
    </Modal>
  );
};

const CashbookSettings: React.FC<{ visible: boolean; settings: CashbookSettingsDto | null; saving: boolean; onClose: () => void; onActivate: (accounts: Array<{ accountId: number; openingBalance: number; openingAt: string }>) => void; onCreateAccount: (input: FinancialAccountCreateInput) => void; onCreateCategory: (input: CashFlowCategoryCreateInput) => void }> = ({ visible, settings, saving, onClose, onActivate, onCreateAccount, onCreateCategory }) => {
  const { theme } = useTheme();
  const [balances, setBalances] = useState<Record<number, string>>({});
  const [openingAt, setOpeningAt] = useState(new Date().toISOString().slice(0, 10));
  const [accountCode, setAccountCode] = useState('BANK-01');
  const [accountName, setAccountName] = useState('Tài khoản ngân hàng');
  const [accountType, setAccountType] = useState<'CASH' | 'BANK' | 'E_WALLET'>('BANK');
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [bankName, setBankName] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);
  const [categoryCode, setCategoryCode] = useState('OTHER_EXPENSE_01');
  const [categoryName, setCategoryName] = useState('Chi phí khác');
  const [categoryDirection, setCategoryDirection] = useState<CashbookDirection>('PAYMENT');
  const [affectsBusinessResult, setAffectsBusinessResult] = useState(true);
  const accounts = settings?.accounts.filter(account => account.isActive) ?? [];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}><ScrollView contentContainerStyle={styles.modalScroll}><Surface style={styles.dialog}>
      <View style={styles.dialogHeading}><Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Cấu hình Sổ quỹ</Text><Pressable onPress={onClose}><X color={theme.textPrimary} /></Pressable></View>
      <Text style={[styles.subtle, { color: theme.textSecondary }]}>Khai báo số dư thực tế cho từng tài khoản tại thời điểm bắt đầu theo dõi.</Text>
      {settings?.activatedAt ? <><Text style={[styles.noticeTitle, { color: theme.success }]}>Đã kích hoạt · {new Date(settings.activatedAt).toLocaleString('vi-VN')}</Text>{accounts.map(account => <DetailLine key={account.id} label={account.name} value={`Số dư đầu kỳ ${formatVnd(account.openingBalance)}`} />)}</> : <>
        <Field label="Ngày bắt đầu theo dõi" webType="date" value={openingAt} onChangeText={setOpeningAt} placeholder="YYYY-MM-DD" />
        {accounts.map(account => <Field key={account.id} label={`${account.name} · ${account.type}`} value={balances[account.id] ?? ''} onChangeText={value => setBalances(current => ({ ...current, [account.id]: value }))} keyboardType="numeric" placeholder="Số dư đầu kỳ (VND)" />)}
        <Button label="Kích hoạt Sổ quỹ" loading={saving} disabled={accounts.length === 0 || accounts.some(account => balances[account.id] === undefined || Number(balances[account.id]) < 0)} onPress={() => onActivate(accounts.map(account => ({ accountId: account.id, openingBalance: Number(balances[account.id]), openingAt: new Date(`${openingAt}T00:00:00`).toISOString() })))} />
      </>}
      <View style={[styles.accountCreatePanel, { borderColor: theme.borderSubtle }]}>
        <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>Thêm tài khoản quỹ</Text>
        <Field label="Mã tài khoản" value={accountCode} onChangeText={setAccountCode} placeholder="BANK-01" />
        <Field label="Tên hiển thị" value={accountName} onChangeText={setAccountName} placeholder="Tên tài khoản" />
        <Choice label="Loại tài khoản" value={accountTypeLabels[accountType]} options={Object.values(accountTypeLabels)} onSelect={value => setAccountType((Object.keys(accountTypeLabels) as Array<keyof typeof accountTypeLabels>).find(type => accountTypeLabels[type] === value) ?? 'CASH')} />
        {accountType === 'BANK' && <><Field label="Ngân hàng" value={bankName} onChangeText={setBankName} placeholder="Tên ngân hàng" /><Field label="Số tài khoản" value={accountIdentifier} onChangeText={setAccountIdentifier} placeholder="Số tài khoản" /></>}
        {accountType === 'E_WALLET' && <><Field label="Nhà cung cấp ví" value={bankName} onChangeText={setBankName} placeholder="Momo, ZaloPay..." /><Field label="Định danh ví" value={accountIdentifier} onChangeText={setAccountIdentifier} placeholder="Số điện thoại / mã ví" /></>}
        <Pressable onPress={() => setMakeDefault(value => !value)} style={styles.defaultToggle}><Text style={{ color: theme.textPrimary }}>{makeDefault ? '☑' : '☐'} Đặt làm tài khoản mặc định cho loại này</Text></Pressable>
        <Button label="Tạo tài khoản" loading={saving} disabled={!accountCode.trim() || !accountName.trim()} onPress={() => {
          const input: FinancialAccountCreateInput = { code: accountCode.trim().toUpperCase(), name: accountName.trim(), type: accountType, isDefault: makeDefault };
          if (accountType === 'BANK') { input.bankName = bankName.trim() || null; input.accountNumber = accountIdentifier.trim() || null; }
          if (accountType === 'E_WALLET') { input.walletProvider = bankName.trim() || null; input.walletIdentifier = accountIdentifier.trim() || null; }
          onCreateAccount(input);
        }} />
      </View>
      <View style={[styles.accountCreatePanel, { borderColor: theme.borderSubtle }]}>
        <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>Thêm danh mục thu chi</Text>
        <Field label="Mã danh mục" value={categoryCode} onChangeText={setCategoryCode} placeholder="OTHER_EXPENSE_01" />
        <Field label="Tên danh mục" value={categoryName} onChangeText={setCategoryName} placeholder="Tên hiển thị" />
        <Choice label="Loại" value={categoryDirection} options={['RECEIPT', 'PAYMENT']} onSelect={value => { setCategoryDirection(value as CashbookDirection); setAffectsBusinessResult(value === 'PAYMENT'); }} />
        <Pressable onPress={() => setAffectsBusinessResult(value => !value)} style={styles.defaultToggle}><Text style={{ color: theme.textPrimary }}>{affectsBusinessResult ? '☑' : '☐'} Ảnh hưởng kết quả kinh doanh</Text></Pressable>
        <Button label="Tạo danh mục" loading={saving} disabled={!categoryCode.trim() || !categoryName.trim()} onPress={() => onCreateCategory({ code: categoryCode.trim().toUpperCase(), name: categoryName.trim(), direction: categoryDirection, affectsBusinessResultDefault: affectsBusinessResult })} />
      </View>
      <Button label="Đóng" variant="quiet" onPress={onClose} />
    </Surface></ScrollView></View>
  </Modal>;
};

const DetailLine: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const { theme } = useTheme();
  return <View style={styles.detailLine}><Text style={[styles.subtle, { color: theme.textSecondary }]}>{label}</Text><Text style={[styles.detailValue, { color: theme.textPrimary }]}>{value}</Text></View>;
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxl },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  notice: { gap: spacing.sm, padding: spacing.lg },
  noticeTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  subtle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryGridCompact: { gap: spacing.sm },
  summaryCard: { flexBasis: 210, flexGrow: 1, gap: spacing.xs, minWidth: 145, padding: spacing.md },
  balanceCard: { borderLeftColor: '#B42318', borderLeftWidth: 4 },
  cardLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  cardAmount: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  filterPanel: { gap: spacing.md, padding: spacing.md },
  filterRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  filterColumn: { alignItems: 'stretch', flexDirection: 'column' },
  choice: { flex: 1, gap: spacing.xs, minWidth: 140, position: 'relative' },
  fieldLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  choiceButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: spacing.md },
  optionsInline: { borderRadius: radii.md, borderWidth: 1, marginTop: spacing.xs, overflow: 'hidden' },
  optionsScroll: { maxHeight: 180 },
  optionItem: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  optionText: { fontSize: typography.sizes.sm },
  tableSurface: { overflow: 'hidden' },
  tableHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md },
  sectionTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  row: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', padding: spacing.md },
  rowMain: { flex: 1, gap: 3, minWidth: 0 },
  rowTitleLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  code: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  status: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  relationship: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  amount: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.md },
  pagination: { alignItems: 'center', borderTopColor: '#D8D4CE', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'center', gap: spacing.md, padding: spacing.md },
  loading: { padding: spacing.xl },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(19, 18, 17, 0.48)', flex: 1, justifyContent: 'center', padding: spacing.md },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-start', paddingVertical: spacing.xl, width: '100%', alignItems: 'center' },
  dialog: { alignSelf: 'center', borderRadius: radii.lg, gap: spacing.md, maxWidth: 600, padding: spacing.lg, width: '100%' },
  dialogHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  closeIconBtn: { alignItems: 'center', borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  detailAmount: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xxl },
  detailLine: { borderBottomColor: '#D8D4CE', borderBottomWidth: StyleSheet.hairlineWidth, gap: 2, paddingVertical: spacing.sm },
  detailValue: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  accountCreatePanel: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  defaultToggle: { paddingVertical: spacing.xs },
  counterpartyMatches: { borderRadius: radii.md, borderWidth: 1, marginTop: spacing.xs, overflow: 'hidden' },
  counterpartyOption: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 2, padding: spacing.sm },
  formGroup: { gap: spacing.xs, width: '100%' },
  directionToggleRow: { flexDirection: 'row', gap: spacing.sm },
  directionButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1.5, flex: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md },
  directionButtonText: { fontSize: typography.sizes.sm },
  amountBadge: { alignSelf: 'flex-start', borderRadius: radii.sm, marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  amountPreview: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.md },
  methodChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  methodChip: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing.md },
  methodChipText: { fontSize: typography.sizes.xs },
  adminTimePanel: { borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  modalActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
});
