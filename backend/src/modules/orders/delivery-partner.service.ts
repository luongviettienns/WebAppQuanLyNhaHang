import { DeliveryPartner, DeliveryPartnerGroup, DeliveryPartnerType, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import { CreateDeliveryPartnerDto, DeliveryPartnerListQuery, UpdateDeliveryPartnerDto } from './delivery-partner.schemas';

const PREFIX = 'DT';
type PartnerWithGroup = DeliveryPartner & { group?: { id: number; name: string } | null };
type DeliveryOrderMetric = { deliveryFee: number; deliveryFeePaid: number };

function asDto(partner: PartnerWithGroup, orders: DeliveryOrderMetric[] = []) {
  const totalDeliveryFee = orders.reduce((sum, order) => sum + order.deliveryFee, 0);
  const outstandingAmount = orders.reduce((sum, order) => sum + Math.max(0, order.deliveryFee - order.deliveryFeePaid), 0);
  return { ...partner, group: partner.group ?? null, totalOrders: orders.length, totalDeliveryFee, outstandingAmount };
}
function formatCode(sequence: number) { return `${PREFIX}${sequence.toString().padStart(6, '0')}`; }
async function nextCode(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ value: bigint | number | string | null }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)), 0) + 1 AS value FROM DeliveryPartner WHERE code REGEXP '^DT[0-9]+$'
  `;
  const sequence = Number(rows[0]?.value ?? 1);
  return formatCode(Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1);
}
function duplicateCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && String(error.meta?.target).toLowerCase().includes('code');
}
function missing(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'; }
function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00+07:00`);
  if (to) { const end = new Date(`${to}T00:00:00+07:00`); end.setUTCDate(end.getUTCDate() + 1); range.lt = end; }
  return range;
}

export class DeliveryPartnerService {
  static async list(query: DeliveryPartnerListQuery) {
    const completedAt = dateRange(query.from, query.to);
    const partners = await prisma.deliveryPartner.findMany({
      where: {
        ...(query.ids ? { id: { in: query.ids } } : {}), ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(query.isActive === 'all' ? {} : { isActive: query.isActive === 'true' }),
        ...(query.search ? { OR: [{ code: { contains: query.search } }, { name: { contains: query.search } }, { phone: { contains: query.search } }] } : {})
      },
      include: { group: { select: { id: true, name: true } }, orders: { where: { orderType: 'DELIVERY', status: 'COMPLETED', ...(completedAt ? { completedAt } : {}) }, select: { deliveryFee: true, deliveryFeePaid: true } } },
      orderBy: [{ code: 'asc' }]
    });
    const filtered = partners.map(partner => asDto(partner, partner.orders)).filter(partner =>
      (query.minDeliveryFee === undefined || partner.totalDeliveryFee >= query.minDeliveryFee) &&
      (query.maxDeliveryFee === undefined || partner.totalDeliveryFee <= query.maxDeliveryFee) &&
      (query.minDebt === undefined || partner.outstandingAmount >= query.minDebt) &&
      (query.maxDebt === undefined || partner.outstandingAmount <= query.maxDebt)
    );
    const summary = filtered.reduce((result, item) => ({ totalOrders: result.totalOrders + item.totalOrders, totalDeliveryFee: result.totalDeliveryFee + item.totalDeliveryFee, outstandingAmount: result.outstandingAmount + item.outstandingAmount }), { totalOrders: 0, totalDeliveryFee: 0, outstandingAmount: 0 });
    const start = (query.page - 1) * query.pageSize;
    return { items: filtered.slice(start, start + query.pageSize), pagination: { page: query.page, pageSize: query.pageSize, totalRows: filtered.length, totalPages: Math.ceil(filtered.length / query.pageSize) }, summary };
  }

  static async selectable(search?: string) {
    const normalized = search?.trim();
    const partners = await prisma.deliveryPartner.findMany({ where: { isActive: true, ...(normalized ? { OR: [{ code: { contains: normalized } }, { name: { contains: normalized } }, { phone: { contains: normalized } }] } : {}) }, include: { group: { select: { id: true, name: true } } }, orderBy: [{ code: 'asc' }], take: 100 });
    return partners.map(partner => asDto(partner));
  }

  static async detail(id: number) {
    const partner = await prisma.deliveryPartner.findUnique({ where: { id }, include: { group: { select: { id: true, name: true } }, orders: { where: { orderType: 'DELIVERY', status: 'COMPLETED' }, select: { deliveryFee: true, deliveryFeePaid: true } } } });
    if (!partner) throw ApiError.notFound('Đối tác giao hàng không tồn tại');
    return asDto(partner, partner.orders);
  }

  static async create(input: CreateDeliveryPartnerDto, actorId?: number, actorName?: string) {
    await this.requireGroup(prisma, input.groupId);
    let created: PartnerWithGroup;
    try {
      created = input.code ? await prisma.deliveryPartner.create({ data: { ...input, code: input.code, partnerType: input.partnerType ?? DeliveryPartnerType.INDIVIDUAL }, include: { group: true } }) : await prisma.$transaction(async tx => tx.deliveryPartner.create({ data: { ...input, code: await nextCode(tx), partnerType: input.partnerType ?? DeliveryPartnerType.INDIVIDUAL }, include: { group: true } }));
    } catch (error) { if (duplicateCode(error)) throw ApiError.conflict('Mã đối tác giao hàng đã tồn tại'); throw error; }
    await AuditService.log({ action: 'DELIVERY_PARTNER_CREATED', targetType: 'DeliveryPartner', targetId: created.id, actorId, actorName, metadata: { code: created.code, name: created.name } });
    this.notify([created.id]); return asDto(created);
  }

  static async update(id: number, input: UpdateDeliveryPartnerDto, actorId?: number, actorName?: string) {
    await this.requireGroup(prisma, input.groupId);
    try {
      const updated = await prisma.deliveryPartner.update({ where: { id }, data: input, include: { group: true } });
      await AuditService.log({ action: 'DELIVERY_PARTNER_UPDATED', targetType: 'DeliveryPartner', targetId: id, actorId, actorName, metadata: { updatedFields: Object.keys(input) } });
      this.notify([id]); return asDto(updated);
    } catch (error) { if (missing(error)) throw ApiError.notFound('Đối tác giao hàng không tồn tại'); throw error; }
  }

  static async createInTransaction(tx: Prisma.TransactionClient, input: CreateDeliveryPartnerDto) {
    await this.requireGroup(tx, input.groupId);
    return tx.deliveryPartner.create({ data: { ...input, code: input.code || await nextCode(tx), partnerType: input.partnerType ?? DeliveryPartnerType.INDIVIDUAL } });
  }

  static async groups() { return prisma.deliveryPartnerGroup.findMany({ orderBy: [{ name: 'asc' }] }); }
  static async saveGroup(id: number | null, name: string, actorId?: number, actorName?: string): Promise<DeliveryPartnerGroup> {
    try {
      const group = id === null ? await prisma.deliveryPartnerGroup.create({ data: { name } }) : await prisma.deliveryPartnerGroup.update({ where: { id }, data: { name } });
      await AuditService.log({ action: id === null ? 'DELIVERY_PARTNER_GROUP_CREATED' : 'DELIVERY_PARTNER_GROUP_UPDATED', targetType: 'DeliveryPartnerGroup', targetId: group.id, actorId, actorName });
      this.notify([group.id]); return group;
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw ApiError.conflict('Tên nhóm đối tác đã tồn tại'); if (missing(error)) throw ApiError.notFound('Nhóm đối tác giao hàng không tồn tại'); throw error; }
  }

  static async requireGroup(tx: Prisma.TransactionClient | typeof prisma, groupId?: number | null) {
    if (groupId && !await tx.deliveryPartnerGroup.findUnique({ where: { id: groupId } })) throw ApiError.badRequest('Nhóm đối tác giao hàng không tồn tại');
  }
  private static notify(ids: number[]) { emitToAll('delivery-partners:changed', { ids, updatedAt: new Date().toISOString() }); }
}
