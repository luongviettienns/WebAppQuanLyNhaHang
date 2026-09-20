import {
  InventoryCatalogRowDto,
  InventoryCatalogSummaryDto,
  InventoryStockStatus
} from '../../api/contracts';
import type { StatusTone } from '../../ui';

export type InventoryRowActionTarget = 'ingredient' | 'menu' | 'unavailable';

const statusPresentation: Record<InventoryStockStatus, { label: string; tone: StatusTone }> = {
  NORMAL: { label: 'Bình thường', tone: 'success' },
  LOW: { label: 'Sắp hết', tone: 'warning' },
  NEGATIVE: { label: 'Tồn âm', tone: 'danger' },
  NOT_TRACKED: { label: 'Không theo dõi', tone: 'neutral' }
};

export function getInventoryStatusPresentation(status: InventoryStockStatus) {
  return statusPresentation[status];
}

export function getInventoryRowKey(row: InventoryCatalogRowDto): string {
  return `${row.sourceType}:${row.sourceId}`;
}

export function getInventoryRowActionTarget(row: InventoryCatalogRowDto): InventoryRowActionTarget {
  if (row.sourceType === 'INGREDIENT') return 'ingredient';
  if (row.sourceType === 'MENU_ITEM') return 'menu';
  return 'unavailable';
}

export function formatInventorySummary(summary: InventoryCatalogSummaryDto) {
  return {
    total: summary.totalRows.toLocaleString('vi-VN'),
    tracked: summary.trackedRows.toLocaleString('vi-VN'),
    alerts: (summary.lowStockRows + summary.negativeStockRows).toLocaleString('vi-VN'),
    stockValue: `${summary.totalStockValue.toLocaleString('vi-VN')} đ`
  };
}

export function formatCatalogNumber(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('vi-VN');
}
