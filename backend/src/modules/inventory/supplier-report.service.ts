import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { SupplierListQuery, supplierListQuerySchema } from './supplier.schemas';

type StatRow = { id: number; totalPurchase: Prisma.Decimal | number; outstandingAmount: Prisma.Decimal | number };

function reportSource(query: SupplierListQuery) {
  const dateConditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  if (query.from) dateConditions.push(Prisma.sql`r.receivedAt >= ${new Date(query.from + 'T00:00:00+07:00')}`);
  if (query.to) dateConditions.push(Prisma.sql`r.receivedAt < ${new Date(new Date(query.to + 'T00:00:00+07:00').getTime() + 86400000)}`);
  const returnDateConditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  if (query.from) returnDateConditions.push(Prisma.sql`pr.returnedAt >= ${new Date(query.from + 'T00:00:00+07:00')}`);
  if (query.to) returnDateConditions.push(Prisma.sql`pr.returnedAt < ${new Date(new Date(query.to + 'T00:00:00+07:00').getTime() + 86400000)}`);
  const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  if (query.isActive !== 'all') conditions.push(Prisma.sql`s.isActive = ${query.isActive === 'true'}`);
  if (query.groupId !== undefined) conditions.push(query.groupId === 0 ? Prisma.sql`s.groupId IS NULL` : Prisma.sql`s.groupId = ${query.groupId}`);
  if (query.ids) conditions.push(Prisma.sql`s.id IN (${Prisma.join(query.ids)})`);
  if (query.search) {
    const search = '%' + query.search.replace(/[\\%_]/g, value => '\\' + value) + '%';
    conditions.push(Prisma.sql`(s.code LIKE ${search} OR s.name LIKE ${search} OR s.phone LIKE ${search} OR s.taxCode LIKE ${search})`);
  }
  const moneyConditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  if (query.minPurchase !== undefined) moneyConditions.push(Prisma.sql`report.totalPurchase >= ${query.minPurchase}`);
  if (query.maxPurchase !== undefined) moneyConditions.push(Prisma.sql`report.totalPurchase <= ${query.maxPurchase}`);
  if (query.minDebt !== undefined) moneyConditions.push(Prisma.sql`report.outstandingAmount >= ${query.minDebt}`);
  if (query.maxDebt !== undefined) moneyConditions.push(Prisma.sql`report.outstandingAmount <= ${query.maxDebt}`);
  return Prisma.sql`FROM (
    SELECT s.id, s.code, s.isActive,
      COALESCE(p.totalPurchase, 0) - COALESCE(ret.totalReturn, 0) AS totalPurchase,
      GREATEST(0, COALESCE(p.outstandingAmount, 0) - COALESCE(ret.returnDebtReduction, 0)) AS outstandingAmount
    FROM Supplier s LEFT JOIN (
      SELECT r.supplierId,
        SUM(CASE WHEN ${Prisma.join(dateConditions, ' AND ')} THEN r.subtotalAmount - r.discountAmount ELSE 0 END) AS totalPurchase,
        SUM(GREATEST(0, r.subtotalAmount - r.discountAmount - r.paidAmount)) AS outstandingAmount
      FROM PurchaseReceipt r WHERE r.status = 'POSTED' GROUP BY r.supplierId
    ) p ON p.supplierId = s.id
    LEFT JOIN (
      SELECT pr.supplierId,
        SUM(CASE WHEN ${Prisma.join(returnDateConditions, ' AND ')} THEN pr.subtotalAmount - pr.discountAmount ELSE 0 END) AS totalReturn,
        SUM(CASE WHEN ${Prisma.join(returnDateConditions, ' AND ')} THEN GREATEST(0, pr.subtotalAmount - pr.discountAmount + pr.vatAmount - pr.refundAmount) ELSE 0 END) AS returnDebtReduction
      FROM PurchaseReturn pr WHERE pr.status = 'COMPLETED' GROUP BY pr.supplierId
    ) ret ON ret.supplierId = s.id
    WHERE ${Prisma.join(conditions, ' AND ')}
  ) report WHERE ${Prisma.join(moneyConditions, ' AND ')}`;
}

export class SupplierReportService {
  static async list(query: SupplierListQuery, exporting = false) {
    const source = reportSource(query);
    return prisma.$transaction(async tx => {
      const [summary] = await tx.$queryRaw<Array<{ totalRows: bigint; totalPurchase: Prisma.Decimal; outstandingAmount: Prisma.Decimal }>>(Prisma.sql`
        SELECT COUNT(*) AS totalRows, COALESCE(SUM(report.totalPurchase),0) AS totalPurchase,
        COALESCE(SUM(report.outstandingAmount),0) AS outstandingAmount ${source}`);
      const totalRows = Number(summary.totalRows);
      if (exporting && totalRows > 10000) throw ApiError.badRequest('Tối đa 10.000 nhà cung cấp mỗi lần xuất. Vui lòng thu hẹp bộ lọc.');
      const stats = await tx.$queryRaw<StatRow[]>(Prisma.sql`SELECT report.id, report.totalPurchase, report.outstandingAmount ${source}
        ORDER BY report.isActive DESC, report.code ASC LIMIT ${exporting ? 10000 : query.pageSize} OFFSET ${exporting ? 0 : (query.page - 1) * query.pageSize}`);
      const suppliers = await tx.supplier.findMany({ where: { id: { in: stats.map(row => row.id) } }, include: { group: { select: { id: true, name: true } } } });
      const byId = new Map(suppliers.map(supplier => [supplier.id, supplier]));
      return {
        items: stats.map(row => ({ ...byId.get(row.id)!, totalPurchase: Number(row.totalPurchase), outstandingAmount: Number(row.outstandingAmount) })),
        pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)) },
        summary: { totalPurchase: Number(summary.totalPurchase), outstandingAmount: Number(summary.outstandingAmount) }
      };
    });
  }

  static async detail(id: number) {
    const result = await this.list(supplierListQuerySchema.parse({ isActive: 'all', ids: String(id) }));
    if (!result.items[0]) throw ApiError.notFound('Nhà cung cấp không tồn tại');
    return result.items[0];
  }

  static async receipts(id: number, page: number, pageSize: number) {
    if (!await prisma.supplier.findUnique({ where: { id }, select: { id: true } })) throw ApiError.notFound('Nhà cung cấp không tồn tại');
    const [totalRows, receipts] = await prisma.$transaction([
      prisma.purchaseReceipt.count({ where: { supplierId: id } }),
      prisma.purchaseReceipt.findMany({ where: { supplierId: id }, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, receiptCode: true, receivedAt: true, status: true, subtotalAmount: true, discountAmount: true, paidAmount: true } })
    ]);
    return { items: receipts.map(row => ({ ...row, payableAmount: row.subtotalAmount - row.discountAmount })), pagination: { page, pageSize, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / pageSize)) } };
  }
}
