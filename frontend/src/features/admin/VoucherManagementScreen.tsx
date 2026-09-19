import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal
} from 'react-native';
import {
  Tag,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  Users,
  Percent,
  Coins,
  X
} from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { VoucherDto, DiscountType } from '../../api/contracts';
import {
  fetchAdminVouchersApi,
  createVoucherApi,
  updateVoucherApi,
  deleteVoucherApi
} from '../../api/vouchers';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';

const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

type FilterStatus = 'ALL' | 'ACTIVE' | 'EXPIRED';

export const VoucherManagementScreen: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { showToast } = useToast();

  const [vouchers, setVouchers] = useState<VoucherDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('10');
  const [minOrderValue, setMinOrderValue] = useState('50000');
  const [maxDiscount, setMaxDiscount] = useState('50000');
  const [usageLimit, setUsageLimit] = useState('100');
  const [daysValid, setDaysValid] = useState('30');

  const loadVouchers = useCallback(async () => {
    try {
      const data = await fetchAdminVouchersApi(token);
      setVouchers(data);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Lỗi tải voucher',
        message: err.message || 'Không thể tải danh sách voucher'
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    void loadVouchers();
  }, [loadVouchers]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    void loadVouchers();
  };

  const handleToggleActive = async (voucher: VoucherDto) => {
    try {
      await updateVoucherApi(token, voucher.id, { isActive: !voucher.isActive });
      showToast({
        type: 'success',
        message: `Đã ${voucher.isActive ? 'tạm dừng' : 'kích hoạt'} voucher ${voucher.code}`
      });
      void loadVouchers();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Lỗi cập nhật',
        message: err.message || 'Không thể cập nhật voucher'
      });
    }
  };

  const handleDelete = async (voucher: VoucherDto) => {
    try {
      const res = await deleteVoucherApi(token, voucher.id);
      showToast({
        type: 'success',
        message: res.softDeleted
          ? `Voucher ${voucher.code} đã được chuyển sang ngừng hoạt động`
          : `Đã xóa voucher ${voucher.code}`
      });
      void loadVouchers();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Lỗi xóa voucher',
        message: err.message || 'Không thể xóa voucher'
      });
    }
  };

  const handleCreateVoucher = async () => {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedTitle = title.trim();
    const dVal = parseInt(discountValue, 10);
    const minVal = parseInt(minOrderValue, 10) || 0;
    const maxVal = maxDiscount ? parseInt(maxDiscount, 10) : undefined;
    const uLimit = parseInt(usageLimit, 10) || 100;
    const days = parseInt(daysValid, 10) || 30;

    if (!trimmedCode || trimmedCode.length < 3) {
      setCreateError('Mã voucher tối thiểu 3 ký tự');
      return;
    }
    if (!trimmedTitle) {
      setCreateError('Vui lòng nhập tên chương trình');
      return;
    }
    if (isNaN(dVal) || dVal <= 0) {
      setCreateError('Giá trị giảm giá không hợp lệ');
      return;
    }
    if (discountType === 'PERCENTAGE' && dVal > 100) {
      setCreateError('Tỷ lệ giảm giá không được vượt quá 100%');
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);

    const now = new Date();
    const startDate = now.toISOString();
    const endDate = new Date(now.getTime() + days * 86400000).toISOString();

    try {
      await createVoucherApi(token, {
        code: trimmedCode,
        title: trimmedTitle,
        discountType,
        discountValue: dVal,
        minOrderValue: minVal,
        maxDiscount: discountType === 'PERCENTAGE' ? maxVal : undefined,
        usageLimit: uLimit,
        startDate,
        endDate
      });

      showToast({
        type: 'success',
        title: 'Tạo voucher thành công! 🎉',
        message: `Mã ${trimmedCode} đã sẵn sàng áp dụng.`
      });

      setIsCreateModalOpen(false);
      resetForm();
      void loadVouchers();
    } catch (err: any) {
      setCreateError(err.message || 'Không thể tạo voucher');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCode('');
    setTitle('');
    setDiscountType('PERCENTAGE');
    setDiscountValue('10');
    setMinOrderValue('50000');
    setMaxDiscount('50000');
    setUsageLimit('100');
    setDaysValid('30');
    setCreateError(null);
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = vouchers.length;
    const now = new Date();
    const active = vouchers.filter(
      (v) => v.isActive && new Date(v.endDate) >= now && v.usedCount < v.usageLimit
    ).length;
    const totalUsed = vouchers.reduce((sum, v) => sum + v.usedCount, 0);
    return { total, active, totalUsed };
  }, [vouchers]);

  // Filtered vouchers
  const filteredVouchers = useMemo(() => {
    const now = new Date();
    return vouchers.filter((v) => {
      // Search
      const matchesSearch =
        v.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Status
      const isExpiredOrFull = new Date(v.endDate) < now || v.usedCount >= v.usageLimit;
      if (filterStatus === 'ACTIVE') {
        return v.isActive && !isExpiredOrFull;
      }
      if (filterStatus === 'EXPIRED') {
        return !v.isActive || isExpiredOrFull;
      }
      return true;
    });
  }, [vouchers, searchQuery, filterStatus]);

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      {/* Header */}
      <View style={[styles.headerContainer, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <ScreenHeader
          title="Khuyến mãi & Voucher"
          description="Quản lý mã giảm giá, voucher % và số tiền cố định cho khách gọi món và thu ngân"
          actions={
            <Button
              variant="primary"
              label="Tạo voucher"
              icon={Plus}
              onPress={() => {
                resetForm();
                setIsCreateModalOpen(true);
              }}
            />
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* KPI Summary Cards */}
        <View style={styles.statsRow}>
          <Surface level="raised" style={styles.statCard}>
            <View style={styles.statIconBadge}>
              <AppIcon icon={Tag} color={theme.primary} size={20} />
            </View>
            <View style={styles.statCopy}>
              <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stats.total}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Tổng mã ưu đãi</Text>
            </View>
          </Surface>

          <Surface level="raised" style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: theme.surfaceSunken }]}>
              <AppIcon icon={CheckCircle2} color={theme.success} size={20} />
            </View>
            <View style={styles.statCopy}>
              <Text style={[styles.statValue, { color: theme.success }]}>{stats.active}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Đang có hiệu lực</Text>
            </View>
          </Surface>

          <Surface level="raised" style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: theme.surfaceSunken }]}>
              <AppIcon icon={Users} color={theme.interactivePrimary} size={20} />
            </View>
            <View style={styles.statCopy}>
              <Text style={[styles.statValue, { color: theme.primary }]}>{stats.totalUsed}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Tổng lượt đã dùng</Text>
            </View>
          </Surface>
        </View>

        {/* Filter & Search Bar */}
        <View style={styles.filterRow}>
          <View style={[styles.searchBox, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <AppIcon icon={Search} color={theme.textSecondary} size={18} />
            <TextInput
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="Tìm theo mã hoặc tên khuyến mãi..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <AppIcon icon={X} color={theme.textSecondary} size={16} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterPills}>
            {(['ALL', 'ACTIVE', 'EXPIRED'] as FilterStatus[]).map((st) => {
              const label = st === 'ALL' ? 'Tất cả' : st === 'ACTIVE' ? 'Đang chạy' : 'Hết hạn/Khóa';
              const isSelected = filterStatus === st;
              return (
                <Pressable
                  key={st}
                  onPress={() => setFilterStatus(st)}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.surfaceBase,
                      borderColor: isSelected ? theme.primary : theme.borderSubtle
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: isSelected ? theme.textInverse : theme.textPrimary }
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Voucher Cards Grid */}
        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang tải danh sách voucher...</Text>
          </View>
        ) : filteredVouchers.length === 0 ? (
          <EmptyState
            title="Không tìm thấy voucher nào"
            description={searchQuery ? 'Thử tìm kiếm với từ khóa khác.' : 'Nhấn "Tạo voucher" để bắt đầu.'}
          />
        ) : (
          <View style={styles.voucherGrid}>
            {filteredVouchers.map((v) => {
              const now = new Date();
              const isExpired = new Date(v.endDate) < now;
              const isExhausted = v.usedCount >= v.usageLimit;
              const isAvailable = v.isActive && !isExpired && !isExhausted;

              const percentUsed = Math.min(100, Math.round((v.usedCount / v.usageLimit) * 100));

              return (
                <Surface key={v.id} level="raised" style={styles.voucherCard}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.codeRow}>
                      <View style={[styles.codeBadge, { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
                        <AppIcon icon={Tag} color={theme.primary} size={14} />
                        <Text style={[styles.codeText, { color: theme.primary }]}>{v.code}</Text>
                      </View>
                      <StatusBadge
                        tone={isAvailable ? 'success' : isExpired ? 'danger' : 'warning'}
                        label={isAvailable ? 'Đang chạy' : isExpired ? 'Hết hạn' : isExhausted ? 'Hết lượt' : 'Tạm khóa'}
                      />
                    </View>

                    <Text style={[styles.voucherTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                      {v.title}
                    </Text>
                  </View>

                  {/* Card Body */}
                  <View style={styles.cardBody}>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Mức giảm:</Text>
                      <Text style={[styles.infoValueHighlight, { color: theme.primary }]}>
                        {v.discountType === 'PERCENTAGE'
                          ? `Giảm ${v.discountValue}%${v.maxDiscount ? ` (Tối đa ${formatVND(v.maxDiscount)})` : ''}`
                          : `Giảm ${formatVND(v.discountValue)}`}
                      </Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Đơn tối thiểu:</Text>
                      <Text style={[styles.infoValue, { color: theme.textPrimary }]}>
                        {v.minOrderValue > 0 ? formatVND(v.minOrderValue) : 'Không giới hạn'}
                      </Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Thời hạn:</Text>
                      <Text style={[styles.infoValue, { color: theme.textPrimary }]}>
                        {new Date(v.startDate).toLocaleDateString('vi-VN')} - {new Date(v.endDate).toLocaleDateString('vi-VN')}
                      </Text>
                    </View>

                    {/* Usage Progress Bar */}
                    <View style={styles.progressContainer}>
                      <View style={styles.progressLabelRow}>
                        <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>Lượt sử dụng:</Text>
                        <Text style={[styles.progressCount, { color: theme.textPrimary }]}>
                          {v.usedCount} / {v.usageLimit} ({percentUsed}%)
                        </Text>
                      </View>
                      <View style={[styles.progressBarBg, { backgroundColor: theme.surfaceSunken }]}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              backgroundColor: percentUsed >= 90 ? theme.danger : theme.primary,
                              width: `${percentUsed}%`
                            }
                          ]}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Card Actions */}
                  <View style={[styles.cardActions, { borderTopColor: theme.borderSubtle }]}>
                    <Button
                      variant={v.isActive ? 'secondary' : 'primary'}
                      label={v.isActive ? 'Tạm dừng' : 'Kích hoạt'}
                      onPress={() => void handleToggleActive(v)}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Xóa voucher ${v.code}`}
                      onPress={() => void handleDelete(v)}
                      style={({ pressed }) => [
                        styles.deleteBtn,
                        { backgroundColor: pressed ? theme.surfaceSunken : 'transparent' }
                      ]}
                    >
                      <AppIcon icon={Trash2} color={theme.danger} size={18} />
                    </Pressable>
                  </View>
                </Surface>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal Tao Voucher Moi */}
      <Modal visible={isCreateModalOpen} transparent animationType="fade" onRequestClose={() => setIsCreateModalOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <Surface level="raised" style={[styles.modalContainer, elevation.modal, { borderColor: theme.borderSubtle }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.modalHeaderTitleRow}>
                <AppIcon icon={Tag} color={theme.primary} size={22} />
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  Tạo mã ưu đãi mới
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                onPress={() => setIsCreateModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <AppIcon icon={X} color={theme.textPrimary} size={20} />
              </Pressable>
            </View>

            {/* Modal Form Content */}
            <ScrollView contentContainerStyle={styles.modalBody}>
              {createError && <InlineAlert title="Lỗi tạo voucher" message={createError} tone="danger" />}

              {/* Mã code */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.textPrimary }]}>Mã Voucher (Code) *</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
                  placeholder="VD: CRISPY10, FREESHIP, COMBO20K"
                  placeholderTextColor={theme.textSecondary}
                  value={code}
                  onChangeText={(t) => setCode(t.toUpperCase())}
                  autoCapitalize="characters"
                />
                <Text style={[styles.formHelp, { color: theme.textSecondary }]}>
                  Chữ cái in hoa, số hoặc gạch ngang (không dấu, không khoảng trắng)
                </Text>
              </View>

              {/* Tên chương trình */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.textPrimary }]}>Tên chương trình ưu đãi *</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
                  placeholder="VD: Giảm 10% tối đa 50.000đ chào mừng khách mới"
                  placeholderTextColor={theme.textSecondary}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              {/* Loại giảm giá */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.textPrimary }]}>Loại hình giảm giá *</Text>
                <View style={styles.typeSelector}>
                  <Pressable
                    onPress={() => setDiscountType('PERCENTAGE')}
                    style={[
                      styles.typeOption,
                      discountType === 'PERCENTAGE' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
                    ]}
                  >
                    <AppIcon icon={Percent} color={discountType === 'PERCENTAGE' ? theme.primary : theme.textSecondary} size={16} />
                    <Text style={[styles.typeOptionText, { color: discountType === 'PERCENTAGE' ? theme.primary : theme.textPrimary }]}>
                      Theo tỷ lệ (%)
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setDiscountType('FIXED_AMOUNT')}
                    style={[
                      styles.typeOption,
                      discountType === 'FIXED_AMOUNT' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
                    ]}
                  >
                    <AppIcon icon={Coins} color={discountType === 'FIXED_AMOUNT' ? theme.primary : theme.textSecondary} size={16} />
                    <Text style={[styles.typeOptionText, { color: discountType === 'FIXED_AMOUNT' ? theme.primary : theme.textPrimary }]}>
                      Số tiền cố định (VND)
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Giá trị giảm */}
              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.formLabel, { color: theme.textPrimary }]}>
                    {discountType === 'PERCENTAGE' ? 'Tỷ lệ giảm (%) *' : 'Số tiền giảm (VND) *'}
                  </Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
                    placeholder={discountType === 'PERCENTAGE' ? '10' : '20000'}
                    placeholderTextColor={theme.textSecondary}
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    keyboardType="numeric"
                  />
                </View>

                {discountType === 'PERCENTAGE' && (
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={[styles.formLabel, { color: theme.textPrimary }]}>Giảm tối đa (VND)</Text>
                    <TextInput
                      style={[styles.formInput, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
                      placeholder="50000"
                      placeholderTextColor={theme.textSecondary}
                      value={maxDiscount}
                      onChangeText={setMaxDiscount}
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>

              {/* Đơn tối thiểu & Lượt dùng */}
              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.formLabel, { color: theme.textPrimary }]}>Đơn hàng tối thiểu (VND)</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
                    placeholder="50000"
                    placeholderTextColor={theme.textSecondary}
                    value={minOrderValue}
                    onChangeText={setMinOrderValue}
                    keyboardType="numeric"
                  />
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.formLabel, { color: theme.textPrimary }]}>Giới hạn số lượt dùng</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
                    placeholder="100"
                    placeholderTextColor={theme.textSecondary}
                    value={usageLimit}
                    onChangeText={setUsageLimit}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Thời hạn hiệu lực */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.textPrimary }]}>Thời hạn áp dụng (số ngày kể từ hôm nay)</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
                  placeholder="30"
                  placeholderTextColor={theme.textSecondary}
                  value={daysValid}
                  onChangeText={setDaysValid}
                  keyboardType="numeric"
                />
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={[styles.modalFooter, { borderTopColor: theme.borderSubtle }]}>
              <Button variant="secondary" label="Hủy" onPress={() => setIsCreateModalOpen(false)} />
              <Button variant="primary" label="Xác nhận tạo" loading={isSubmitting} onPress={() => void handleCreateVoucher()} />
            </View>
          </Surface>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerContainer: { borderBottomWidth: 1 },
  scrollContent: { gap: spacing.lg, padding: spacing.lg },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  statCard: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 180,
    padding: spacing.md
  },
  statIconBadge: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  statCopy: { gap: 2 },
  statValue: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl
  },
  statLabel: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between'
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 44,
    minWidth: 240,
    paddingHorizontal: spacing.md
  },
  searchInput: {
    flex: 1,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm
  },
  filterPills: {
    flexDirection: 'row',
    gap: spacing.xs
  },
  pill: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  pillText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  centerBox: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl
  },
  loadingText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm
  },
  voucherGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg
  },
  voucherCard: {
    borderRadius: radii.md,
    flex: 1,
    gap: spacing.md,
    minWidth: 320,
    padding: spacing.lg
  },
  cardHeader: { gap: spacing.xs },
  codeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  codeBadge: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  codeText: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.sm,
    letterSpacing: 0.5
  },
  voucherTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.md,
    marginTop: spacing.xs
  },
  cardBody: { gap: spacing.xs },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  infoLabel: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  infoValue: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  },
  infoValueHighlight: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xs
  },
  progressContainer: {
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  progressLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  progressLabel: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  progressCount: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  },
  progressBarBg: {
    borderRadius: radii.sm,
    height: 6,
    overflow: 'hidden',
    width: '100%'
  },
  progressBarFill: {
    borderRadius: radii.sm,
    height: '100%'
  },
  cardActions: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md
  },
  deleteBtn: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  modalBackdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md
  },
  modalContainer: {
    borderRadius: radii.lg,
    borderWidth: 1,
    maxHeight: '90%',
    maxWidth: 540,
    overflow: 'hidden',
    width: '100%'
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg
  },
  modalHeaderTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  modalTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.lg
  },
  modalCloseBtn: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  modalBody: {
    gap: spacing.md,
    padding: spacing.lg
  },
  formGroup: { gap: spacing.xs },
  formLabel: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.sm
  },
  formInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    height: 44,
    paddingHorizontal: spacing.md
  },
  formHelp: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  typeSelector: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  typeOption: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm
  },
  typeOptionText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.md
  },
  modalFooter: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
    padding: spacing.lg
  }
});
