import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { SalesReportAdapter, type SalesReportRow, type SalesSummary } from './sales.adapter';
import { CashflowReportAdapter, type CashflowSummary } from './cashflow.adapter';
import type { CashflowEvent } from './cashflow.registry';
import { GoodsReportAdapter, type GoodsReportRow, type GoodsSummary } from './goods.adapter';
import { CancelledItemsReportAdapter, type CancelledItemReportRow, type CancelledItemsSummary } from './cancelled-items.adapter';
import { SummaryReportAdapter, type SummaryReportSummary } from './summary.adapter';
import { endOfDayReportMetadataSchema } from './end-of-day.schemas';
import type { EndOfDayReportQuery, EndOfDayReportResponse, NormalizedConcernResult } from './end-of-day.types';

export type EndOfDayReportRow = SalesReportRow | CashflowEvent | GoodsReportRow | CancelledItemReportRow;
export type EndOfDayReportSummary = (SalesSummary | CashflowSummary | GoodsSummary | CancelledItemsSummary | SummaryReportSummary)
  & { invariantCounters: Record<string, number> };

export class EndOfDayReportService {
  constructor(private readonly client: Pick<PrismaClient, '$transaction'> = prisma) {}

  async get(query: EndOfDayReportQuery): Promise<EndOfDayReportResponse<EndOfDayReportRow, EndOfDayReportSummary>> {
    return this.client.$transaction(async tx => {
      // This SELECT is a DB-clock marker, not an InnoDB/MVCC read-view timestamp.
      // The first adapter's consistent table read establishes the shared read view.
      const [clock] = await tx.$queryRaw<{ asOf: Date }[]>`SELECT UTC_TIMESTAMP(3) AS asOf`;
      type DomainSummary = SalesSummary | CashflowSummary | GoodsSummary | CancelledItemsSummary | SummaryReportSummary;
      let result: NormalizedConcernResult<EndOfDayReportRow, DomainSummary>;
      switch (query.concern) {
        case 'SALES': result = await SalesReportAdapter.read(tx, query); break;
        case 'CASHFLOW': result = await CashflowReportAdapter.read(tx, query); break;
        case 'GOODS': result = await GoodsReportAdapter.read(tx, query); break;
        case 'CANCELLED_ITEMS': result = await CancelledItemsReportAdapter.read(tx, query); break;
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
        // Summary has no detail rows. Source counts remain in its invariantCounters
        // and establish hasData independently of this empty detail pagination.
        pagination: query.concern === 'SUMMARY'
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
