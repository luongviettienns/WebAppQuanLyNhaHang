import type { PurchaseReceiptListFilter, PurchaseReceiptStatus } from '../../api/contracts';

export {
  formatReceiptDate,
  formatReceiptMoney,
  getPurchaseReceiptRowKey,
  getPurchaseReceiptStatusPresentation
} from './purchaseReceiptViewModel';

const defaultStatuses: PurchaseReceiptStatus[] = ['DRAFT', 'POSTED'];

export function getReceiptListFilterSummary(filter: PurchaseReceiptListFilter): {
  statuses: PurchaseReceiptStatus[];
  search: string;
} {
  return {
    statuses: filter.status === undefined ? [...defaultStatuses] : [...filter.status],
    search: filter.search?.trim() ?? ''
  };
}
