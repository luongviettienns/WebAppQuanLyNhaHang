import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions
} from 'react-native';
import {
  Ban,
  ClipboardList,
  Clock3,
  ImageIcon,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  UserCheck
} from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { AuditLogDto, AuditLogsPageDto } from '../../api/contracts';
import { getApiBaseUrl } from '../../api/config';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import { statusTone, StatusTone } from '../../ui/tokens';

type FilterCategory = 'ALL' | 'MENU' | 'IMAGE' | 'ORDER';

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(amount);
}

function formatRelativeTime(dateIso: string): string {
  try {
    const then = new Date(dateIso).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 45) return 'Vừa xong';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
    if (diffSec < 172800) return 'Hôm qua';

    const d = new Date(dateIso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} - ${day}/${month}/${year}`;
  } catch {
    return dateIso;
  }
}

export const AuditLogScreen: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);

  const [filter, setFilter] = useState<FilterCategory>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (targetPage: number, currentFilter: FilterCategory, isAppend = false) => {
      try {
        if (!isAppend) {
          setIsLoading(true);
        } else {
          setIsLoadingMore(true);
        }
        setError(null);

        const base = getApiBaseUrl();
        const params = new URLSearchParams();
        params.append('page', String(targetPage));
        params.append('limit', '20');

        if (currentFilter === 'ORDER') {
          params.append('action', 'ORDER_VOIDED');
        } else if (currentFilter === 'IMAGE') {
          params.append('action', 'MENU_IMAGE_UPLOADED');
        } else if (currentFilter === 'MENU') {
          params.append('targetType', 'MenuItem');
        }

        const res = await fetch(`${base}/api/audit?${params.toString()}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error?.message || `Lỗi tải nhật ký (${res.status})`);
        }

        const json = await res.json();
        const pageData: AuditLogsPageDto = json.data;

        if (isAppend) {
          setLogs((prev) => [...prev, ...pageData.logs]);
        } else {
          setLogs(pageData.logs);
        }
        setPage(pageData.page);
        setTotalPages(pageData.totalPages);
        setTotal(pageData.total);
      } catch (err: any) {
        setError(err.message || 'Không thể kết nối đến máy chủ.');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        setIsRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchLogs(1, filter, false);
  }, [fetchLogs, filter]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchLogs(1, filter, false);
  }, [fetchLogs, filter]);

  const handleLoadMore = useCallback(() => {
    if (page < totalPages && !isLoadingMore && !isLoading) {
      fetchLogs(page + 1, filter, true);
    }
  }, [fetchLogs, page, totalPages, isLoadingMore, isLoading, filter]);

  const getActionConfig = (action: string): { title: string; tone: StatusTone; icon: any } => {
    switch (action) {
      case 'MENU_ITEM_CREATED':
        return {
          title: 'Tạo món mới',
          tone: 'success',
          icon: Plus
        };
      case 'MENU_ITEM_UPDATED':
        return {
          title: 'Cập nhật món',
          tone: 'info',
          icon: Pencil
        };
      case 'MENU_ITEM_AVAILABILITY_CHANGED':
        return {
          title: 'Đổi trạng thái món',
          tone: 'warning',
          icon: SlidersHorizontal
        };
      case 'MENU_IMAGE_UPLOADED':
        return {
          title: 'Tải ảnh món ăn',
          tone: 'neutral',
          icon: ImageIcon
        };
      case 'ORDER_VOIDED':
        return {
          title: 'Hủy đơn hàng',
          tone: 'danger',
          icon: Ban
        };
      default:
        return {
          title: action,
          tone: 'neutral',
          icon: ClipboardList
        };
    }
  };

  const renderMetadata = (log: AuditLogDto) => {
    const meta = log.metadata || {};
    switch (log.action) {
      case 'MENU_ITEM_CREATED':
        return (
          <View style={styles.metaRow}>
            <Text style={[styles.metaBold, { color: theme.textPrimary }]}>{meta.name}</Text>
            {meta.basePrice != null && (
              <Text style={[styles.metaText, { color: theme.primary }]}> • {formatVnd(meta.basePrice)}</Text>
            )}
            {meta.sku && <Text style={[styles.metaSub, { color: theme.textSecondary }]}> (SKU: {meta.sku})</Text>}
          </View>
        );

      case 'MENU_ITEM_UPDATED':
        return (
          <View style={styles.metaCol}>
            <Text style={[styles.metaBold, { color: theme.textPrimary }]}>{meta.name}</Text>
            {meta.previousBasePrice != null && meta.basePrice != null && meta.previousBasePrice !== meta.basePrice && (
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                Giá: {formatVnd(meta.previousBasePrice)} ➔ <Text style={{ color: theme.primary, fontWeight: '600' }}>{formatVnd(meta.basePrice)}</Text>
              </Text>
            )}
            {meta.previousName && meta.previousName !== meta.name && (
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                Tên cũ: &quot;{meta.previousName}&quot;
              </Text>
            )}
          </View>
        );

      case 'MENU_ITEM_AVAILABILITY_CHANGED':
        return (
          <View style={styles.metaRow}>
            <Text style={[styles.metaBold, { color: theme.textPrimary }]}>{meta.name}: </Text>
            <StatusBadge
              tone={meta.isAvailable ? 'success' : 'danger'}
              label={meta.isAvailable ? 'Còn món' : 'Báo hết hàng (86d)'}
            />
          </View>
        );

      case 'MENU_IMAGE_UPLOADED':
        return (
          <View style={styles.metaCol}>
            <Text style={[styles.metaBold, { color: theme.textPrimary }]}>Tệp: {meta.fileName || 'Ảnh mới'}</Text>
            {meta.fileSize && (
              <Text style={[styles.metaSub, { color: theme.textSecondary }]}>
                Dung lượng: {Math.round(meta.fileSize / 1024)} KB
              </Text>
            )}
          </View>
        );

      case 'ORDER_VOIDED':
        return (
          <View style={styles.metaCol}>
            <View style={styles.metaRow}>
              <Text style={[styles.metaBold, { color: theme.danger }]}>Mã đơn: #{meta.code}</Text>
              {meta.tableNumber && (
                <Text style={[styles.metaText, { color: theme.textSecondary }]}> (Bàn {meta.tableNumber})</Text>
              )}
              {meta.totalAmount != null && (
                <Text style={[styles.metaText, { color: theme.textPrimary }]}> • {formatVnd(meta.totalAmount)}</Text>
              )}
            </View>
            {meta.reason && (
              <Text style={[styles.metaText, { color: theme.textSecondary, marginTop: 2 }]}>
                Lý do: &quot;{meta.reason}&quot;
              </Text>
            )}
          </View>
        );

      default:
        return (
          <Text style={[styles.metaText, { color: theme.textSecondary }]}>
            {JSON.stringify(meta)}
          </Text>
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <ScreenHeader
        title="Nhật ký hệ thống"
        description="Theo dõi và kiểm tra các hành động quản trị (Thực đơn, Ảnh món, Hủy đơn hàng)"
        actions={
          <Button
            variant="secondary"
            label="Làm mới"
            icon={RefreshCw}
            onPress={handleRefresh}
            loading={isRefreshing}
          />
        }
      />

      {/* Filter Tabs & KPI */}
      <View style={[styles.toolbar, isMobile && styles.toolbarMobile, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.filterChips}>
          {(
            [
              { id: 'ALL', label: 'Tất cả' },
              { id: 'MENU', label: 'Thực đơn' },
              { id: 'IMAGE', label: 'Tải ảnh' },
              { id: 'ORDER', label: 'Hủy đơn' }
            ] as const
          ).map((item) => {
            const active = filter === item.id;
            return (
              <Pressable
                key={item.id}
                testID={`audit-filter-${item.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? theme.interactiveSecondary : theme.surfaceSunken,
                    borderColor: active ? theme.primary : 'transparent'
                  }
                ]}
                onPress={() => setFilter(item.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: active ? theme.primary : theme.textSecondary,
                      fontFamily: active ? typography.families.bodySemibold : typography.families.bodyMedium
                    }
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.kpiContainer}>
          <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Tổng bản ghi:</Text>
          <Text style={[styles.kpiValue, { color: theme.textPrimary }]}>{total}</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <InlineAlert tone="danger" message={error} />
        </View>
      )}

      {/* Main Content Area */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[theme.primary]} />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang tải nhật ký thao tác...</Text>
          </View>
        ) : logs.length === 0 ? (
          <EmptyState
            title="Không có bản ghi nhật ký nào"
            description="Chưa có hành động thao tác nào được ghi nhận cho bộ lọc đã chọn."
          />
        ) : (
          <View style={styles.timeline}>
            {logs.map((log, index) => {
              const cfg = getActionConfig(log.action);
              const toneColors = statusTone[cfg.tone];
              const isLast = index === logs.length - 1;

              return (
                <View key={log.id} style={styles.timelineRow}>
                  {/* Timeline connector rail */}
                  <View style={styles.railColumn}>
                    <View style={[styles.actionIconBubble, { backgroundColor: toneColors.background }]}>
                      <AppIcon icon={cfg.icon} size={16} color={toneColors.foreground} />
                    </View>
                    {!isLast && <View style={[styles.railLine, { backgroundColor: theme.borderSubtle }]} />}
                  </View>

                  {/* Card content */}
                  <Surface level="raised" style={styles.logCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.badgeAndTitle}>
                        <StatusBadge tone={cfg.tone} label={cfg.title} />
                        <View style={styles.actorBadge}>
                          <AppIcon icon={UserCheck} size={13} color={theme.textSecondary} />
                          <Text style={[styles.actorName, { color: theme.textPrimary }]}>
                            {log.actorName || 'Hệ thống'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.timestampContainer}>
                        <AppIcon icon={Clock3} size={13} color={theme.textSecondary} />
                        <Text style={[styles.timestampText, { color: theme.textSecondary }]}>
                          {formatRelativeTime(log.createdAt)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardBody}>
                      {renderMetadata(log)}
                    </View>
                  </Surface>
                </View>
              );
            })}

            {/* Load More Button */}
            {page < totalPages && (
              <View style={styles.loadMoreContainer}>
                <Button
                  variant="secondary"
                  label={isLoadingMore ? 'Đang tải...' : 'Tải thêm nhật ký'}
                  onPress={handleLoadMore}
                  loading={isLoadingMore}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.md
  },
  toolbarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch'
  },
  filterChips: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap'
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1
  },
  filterChipText: {
    fontSize: typography.sizes.xs
  },
  kpiContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  kpiLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.families.bodyMedium
  },
  kpiValue: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.families.bodyBold
  },
  errorBanner: {
    padding: spacing.md
  },
  scrollContent: {
    padding: spacing.lg
  },
  loadingContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md
  },
  loadingText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.families.bodyMedium
  },
  timeline: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center'
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 80
  },
  railColumn: {
    alignItems: 'center',
    width: 44,
    marginRight: spacing.sm
  },
  actionIconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  railLine: {
    width: 2,
    flex: 1,
    marginVertical: 4
  },
  logCard: {
    flex: 1,
    marginBottom: spacing.md,
    padding: spacing.md
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  badgeAndTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap'
  },
  actorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  actorName: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.families.bodySemibold
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  timestampText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.families.bodyMedium
  },
  cardBody: {
    marginTop: 2
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  metaCol: {
    gap: 2
  },
  metaBold: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.families.bodySemibold
  },
  metaText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.families.bodyMedium
  },
  metaSub: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.families.bodyMedium
  },
  loadMoreContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg
  }
});
