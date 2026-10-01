import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import { CustomerCreateInput, CustomerGroupInput, CustomerListQuery } from './customers.schemas';

const normalizePhone = (phone?: string | null) => {
  const normalized = phone?.replace(/\D/g, '') || null;
  return normalized || null;
};

const toDto = (customer: any, stats = { totalSales: 0, netSales: 0, outstandingDebt: 0, lastTransactionAt: null as Date | null }) => ({
  ...customer,
  totalSales: stats.totalSales,
  netSales: stats.netSales,
  outstandingDebt: stats.outstandingDebt,
  lastTransactionAt: stats.lastTransactionAt?.toISOString() ?? null
});

export class CustomersService {
  static async createGroup(input: CustomerGroupInput, actorId?: number, actorName?: string) {
    try {
      const group = await prisma.$transaction(async tx => {
        const created = await tx.customerGroup.create({ data: input });
        await AuditService.logInTransaction(tx, { action: 'CUSTOMER_GROUP_CREATED', targetType: 'CustomerGroup', targetId: created.id, actorId, actorName });
        return created;
      });
      emitToAll('customers:changed', { ids: [], updatedAt: new Date().toISOString() });
      return group;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw ApiError.conflict('Mã hoặc tên nhóm khách hàng đã tồn tại');
      throw error;
    }
  }

  static async create(input: CustomerCreateInput, actorId?: number, actorName?: string) {
    const phone = normalizePhone(input.phone);
    try {
      const customer = await prisma.$transaction(async tx => {
        if (input.groupId) {
          const group = await tx.customerGroup.findFirst({ where: { id: input.groupId, isActive: true } });
          if (!group) throw ApiError.badRequest('Nhóm khách hàng không tồn tại hoặc đã ngừng hoạt động');
        }
        const last = await tx.customer.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
        const code = `KH${String((last?.id ?? 0) + 1).padStart(6, '0')}`;
        const created = await tx.customer.create({ data: { ...input, phone, groupId: input.groupId ?? null, email: input.email ?? null, province: input.province ?? null, address: input.address ?? null, gender: input.gender ?? null, code }, include: { group: true } });
        await AuditService.logInTransaction(tx, { action: 'CUSTOMER_CREATED', targetType: 'Customer', targetId: created.id, actorId, actorName, metadata: { code: created.code } });
        return created;
      });
      emitToAll('customers:changed', { ids: [customer.id], updatedAt: new Date().toISOString() });
      return toDto(customer);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw ApiError.conflict('Số điện thoại hoặc mã khách hàng đã tồn tại');
      throw error;
    }
  }

  static async list(query: CustomerListQuery) {
    const where: Prisma.CustomerWhereInput = {
      ...(query.search ? { OR: [{ code: { contains: query.search } }, { name: { contains: query.search } }, { phone: { contains: normalizePhone(query.search) ?? query.search } }] } : {}),
      ...(query.isActive && query.isActive !== 'all' ? { isActive: query.isActive === 'true' } : {}),
      ...(query.groupId !== undefined ? { groupId: query.groupId === 0 ? null : query.groupId } : {}),
      ...(query.type ? { type: query.type } : {}), ...(query.gender ? { gender: query.gender } : {}),
      ...(query.province ? { province: { contains: query.province } } : {}),
      ...(query.birthDateFrom || query.birthDateTo ? { birthDate: { ...(query.birthDateFrom ? { gte: query.birthDateFrom } : {}), ...(query.birthDateTo ? { lte: query.birthDateTo } : {}) } } : {}),
      ...(query.createdFrom || query.createdTo ? { createdAt: { ...(query.createdFrom ? { gte: query.createdFrom } : {}), ...(query.createdTo ? { lte: query.createdTo } : {}) } } : {})
    };
    const customers = await prisma.customer.findMany({ where, include: { group: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const orderStats = new Map<number, { totalSales: number; netSales: number; returnedAmount: number; outstandingDebt: number; lastTransactionAt: Date | null }>();
    if (customers.length) {
      const orders = await prisma.order.findMany({
        where: { customerId: { in: customers.map(customer => customer.id) }, status: { not: 'CANCELLED' } },
        select: { customerId: true, finalAmount: true, paymentStatus: true, paidAt: true, createdByUserId: true, payLaterAuthorized: true, reservationId: true }
      });
      for (const order of orders) {
        if (order.customerId === null) continue;
        const stats = orderStats.get(order.customerId) ?? { totalSales: 0, netSales: 0, returnedAmount: 0, outstandingDebt: 0, lastTransactionAt: null };
        if (order.paymentStatus === 'PAID') {
          stats.totalSales += order.finalAmount;
          if (order.paidAt && (!stats.lastTransactionAt || order.paidAt > stats.lastTransactionAt)) stats.lastTransactionAt = order.paidAt;
        } else if (order.paymentStatus === 'UNPAID' && (order.createdByUserId !== null || order.payLaterAuthorized || order.reservationId === null)) {
          stats.outstandingDebt += order.finalAmount;
        }
        orderStats.set(order.customerId, stats);
      }
      const returns = await prisma.orderReturn.findMany({
        where: { status: 'COMPLETED', order: { customerId: { in: customers.map(customer => customer.id) }, paymentStatus: 'PAID' } },
        select: { totalRefundDue: true, order: { select: { customerId: true } } }
      });
      for (const orderReturn of returns) {
        const customerId = orderReturn.order.customerId;
        if (customerId === null) continue;
        const stats = orderStats.get(customerId) ?? { totalSales: 0, netSales: 0, returnedAmount: 0, outstandingDebt: 0, lastTransactionAt: null };
        stats.returnedAmount += orderReturn.totalRefundDue;
        orderStats.set(customerId, stats);
      }
      for (const stats of orderStats.values()) stats.netSales = Math.max(0, stats.totalSales - stats.returnedAmount);
    }
    const matchesRange = (value: number, min?: number, max?: number) => (min === undefined || value >= min) && (max === undefined || value <= max);
    const filtered = customers.filter(customer => {
      const stats = orderStats.get(customer.id) ?? { totalSales: 0, netSales: 0, returnedAmount: 0, outstandingDebt: 0, lastTransactionAt: null };
      return matchesRange(stats.totalSales, query.minSales, query.maxSales) && matchesRange(stats.outstandingDebt, query.minDebt, query.maxDebt);
    });
    const totalRows = filtered.length;
    const pageItems = filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    const summary = filtered.reduce((totals, customer) => {
      const stats = orderStats.get(customer.id);
      totals.totalSales += stats?.totalSales ?? 0;
      totals.netSales += stats?.netSales ?? 0;
      totals.outstandingDebt += stats?.outstandingDebt ?? 0;
      return totals;
    }, { totalSales: 0, netSales: 0, outstandingDebt: 0 });
    return {
      items: pageItems.map(customer => toDto(customer, orderStats.get(customer.id))),
      pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.ceil(totalRows / query.pageSize) },
      summary
    };
  }

  static async groups() {
    return prisma.customerGroup.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  static async selectable(search?: string) {
    const normalized = normalizePhone(search);
    return prisma.customer.findMany({ where: { isActive: true, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }, { phone: { contains: normalized ?? search } }] } : {}) }, select: { id: true, code: true, name: true, phone: true, groupId: true, group: { select: { id: true, name: true } } }, orderBy: { name: 'asc' }, take: 30 });
  }
}
