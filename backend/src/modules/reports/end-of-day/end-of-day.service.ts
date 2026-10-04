import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { ApiError } from '../../../lib/api-error';
import { SalesReportAdapter, type SalesReportRow, type SalesSummary } from './sales.adapter';
import { CashflowReportAdapter, type CashflowSummary } from './cashflow.adapter';
import type { CashflowEvent } from './cashflow.registry';
import { GoodsReportAdapter, type GoodsReportRow, type GoodsSummary } from './goods.adapter';
import { CancelledItemsReportAdapter, type CancelledItemReportRow, type CancelledItemsSummary } from './cancelled-items.adapter';
import { SummaryReportAdapter, type SummaryReportRow, type SummaryReportSummary } from './summary.adapter';
import { endOfDayReportMetadataSchema } from './end-of-day.schemas';
import type { EndOfDayReportQuery, EndOfDayReportResponse, NormalizedConcernResult } from './end-of-day.types';

export type EndOfDayReportRow = SalesReportRow | CashflowEvent | GoodsReportRow | CancelledItemReportRow | SummaryReportRow;
export type EndOfDayReportSummary = (SalesSummary | CashflowSummary | GoodsSummary | CancelledItemsSummary | SummaryReportSummary)
  & { invariantCounters: Record<string, number> };

/** Internal service mode; controllers must not accept it as an unchecked HTTP query flag. */
export type EndOfDayReadOptions = { mode: 'SCREEN' } | { mode: 'EXPORT'; maxRows: number };
export class EndOfDayReportRowLimitError extends Error {
  readonly code = 'REPORT_EXPORT_TOO_LARGE';
  readonly statusCode = 413;
  constructor(readonly estimatedRows: number, readonly maxRows: number) {
    super('Report detail row limit exceeded');
    this.name = 'EndOfDayReportRowLimitError';
  }
}

export class EndOfDayReportService {
  constructor(private readonly client: Pick<PrismaClient, '$transaction'> = prisma) {}

  async get(query: EndOfDayReportQuery, options: EndOfDayReadOptions = { mode: 'SCREEN' }): Promise<EndOfDayReportResponse<EndOfDayReportRow, EndOfDayReportSummary>> {
    const exporting = options.mode === 'EXPORT';
    const paginated = !exporting && !(query.concern === 'SUMMARY' && query.view === 'VERTICAL');
    const pageEnd = paginated ? query.page * query.pageSize : 0;
    if (!Number.isSafeInteger(pageEnd)) throw ApiError.badRequest('Phân trang báo cáo vượt giới hạn số nguyên an toàn');
    if (options.mode === 'EXPORT' && (!Number.isSafeInteger(options.maxRows) || options.maxRows < 1)) {
      throw ApiError.badRequest('Giới hạn dòng xuất báo cáo không hợp lệ');
    }
    const exportLimit = options.mode === 'EXPORT' ? Math.min(options.maxRows, 50_000) : 0;
    return this.client.$transaction(async tx => {
      // This SELECT is a DB-clock marker, not an InnoDB/MVCC read-view timestamp.
      // The first adapter's consistent table read establishes the shared read view.
      const [clock] = await tx.$queryRaw<{ asOf: Date }[]>`SELECT UTC_TIMESTAMP(3) AS asOf`;
      type DomainSummary = SalesSummary | CashflowSummary | GoodsSummary | CancelledItemsSummary | SummaryReportSummary;
      let result: NormalizedConcernResult<EndOfDayReportRow, DomainSummary>;
      switch (query.concern) {
        case 'SALES': case 'CASHFLOW': case 'GOODS': case 'CANCELLED_ITEMS': {
          const adapters = { SALES: SalesReportAdapter, CASHFLOW: CashflowReportAdapter,
            GOODS: GoodsReportAdapter, CANCELLED_ITEMS: CancelledItemsReportAdapter };
          const read = adapters[query.concern].read;
          result = await read(tx, exporting ? { ...query, page: 1, pageSize: 1 } : query);
          if (exporting) {
            if (result.totalRows > exportLimit) throw new EndOfDayReportRowLimitError(result.totalRows, exportLimit);
            if (result.totalRows > 1) result = await read(tx, { ...query, page: 1, pageSize: result.totalRows });
          }
          break;
        }
        case 'SUMMARY': {
          // Adapter aggregates/counts are unpaginated independently of their detail LIMIT.
          // Keep detail reads bounded; Summary consumes only summaries and counters.
          const base = { date: query.date, fromTime: query.fromTime, toTime: query.toTime,
            from: query.from, to: query.to, timezone: query.timezone, view: query.view,
            page: 1, pageSize: 1 };
          const sales = await SalesReportAdapter.read(tx, { ...base, concern: 'SALES' });
          const cashflow = await CashflowReportAdapter.read(tx, { ...base, concern: 'CASHFLOW' });
          const goods = await GoodsReportAdapter.read(tx, { ...base, concern: 'GOODS' });
          const cancellations = await CancelledItemsReportAdapter.read(tx, { ...base, concern: 'CANCELLED_ITEMS' });
          result = SummaryReportAdapter.compose(sales, cashflow, goods, cancellations);
          if (exporting && result.totalRows > exportLimit) throw new EndOfDayReportRowLimitError(result.totalRows, exportLimit);
          const start = exporting ? 0 : (query.page - 1) * query.pageSize;
          if ((exporting || query.view === 'HORIZONTAL') && start < result.totalRows) {
            // A domain prefix of K contains every candidate for the global top K:
            // its K earlier native records necessarily precede any omitted record.
            const count = exporting ? result.totalRows : Math.min(pageEnd, result.totalRows);
            const fullSales = sales.totalRows <= 1 ? sales
              : await SalesReportAdapter.read(tx, { ...base, concern: 'SALES', pageSize: Math.min(count, sales.totalRows) });
            const fullCashflow = cashflow.totalRows <= 1 ? cashflow
              : await CashflowReportAdapter.read(tx, { ...base, concern: 'CASHFLOW', pageSize: Math.min(count, cashflow.totalRows) });
            const fullGoods = goods.totalRows <= 1 ? goods
              : await GoodsReportAdapter.read(tx, { ...base, concern: 'GOODS', pageSize: Math.min(count, goods.totalRows) });
            const fullCancellations = cancellations.totalRows <= 1 ? cancellations
              : await CancelledItemsReportAdapter.read(tx, { ...base, concern: 'CANCELLED_ITEMS', pageSize: Math.min(count, cancellations.totalRows) });
            const merged = SummaryReportAdapter.mergeRecords(fullSales, fullCashflow, fullGoods, fullCancellations);
            result = { ...result, records: exporting ? merged : merged.slice(start, pageEnd) };
          }
          break;
        }
      }
      const response: EndOfDayReportResponse<EndOfDayReportRow, EndOfDayReportSummary> = {
        metadata: { date: query.date, from: query.from.toISOString(), to: query.to.toISOString(), timezone: query.timezone,
          asOf: clock.asOf.toISOString(), generatedAt: '', concern: query.concern, view: query.view,
          operatingScope: { code: 'MAIN', name: 'Nhà hàng chính', locked: true } },
        hasData: result.totalRows > 0,
        summary: { ...result.summary, invariantCounters: result.invariantCounters },
        rows: result.records,
        // Vertical Summary is an overview. Horizontal and export use actual merged details.
        pagination: exporting
          ? { page: 1, pageSize: Math.max(result.totalRows, 1), totalRows: result.totalRows, totalPages: result.totalRows > 0 ? 1 : 0 }
          : query.concern === 'SUMMARY' && query.view === 'VERTICAL'
          ? { page: 1, pageSize: query.pageSize, totalRows: 0, totalPages: 0 }
          : { page: query.page, pageSize: query.pageSize, totalRows: result.totalRows,
            totalPages: Math.ceil(result.totalRows / query.pageSize) },
        filterOptions: result.filterOptions
      };
      // Sample completion after payload assembly. Clamp clock skew to preserve marker order.
      response.metadata.generatedAt = new Date(Math.max(Date.now(), clock.asOf.getTime())).toISOString();
      response.metadata = endOfDayReportMetadataSchema.parse(response.metadata);
      return response;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
  }
}
