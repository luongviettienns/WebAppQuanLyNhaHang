import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import { getVietQrInstructions } from '../../lib/vietqr';
import {
  CheckInReservationInput,
  ConfirmDepositInput,
  CreatePublicReservationInput,
  MarkNoShowInput,
  PublicCancellationInput,
  ReservationListQuery,
  RejectDepositInput,
  RefundDepositInput,
  RescheduleReservationInput,
  StaffCancellationInput
} from './reservations.schemas';

const normalizePhone = (value: string) => value.replace(/\D/g, '');
const bookingPrefix = (date: Date) => `BK${date.toISOString().slice(0, 10).replace(/-/g, '')}`;

const publicDto = (reservation: any) => ({
  code: reservation.code,
  accessToken: reservation.accessToken,
  status: reservation.status,
  depositStatus: reservation.depositStatus,
  depositAmount: reservation.depositAmount,
  scheduledAt: reservation.scheduledAt,
  partySize: reservation.partySize,
  transferContent: `COC ${reservation.code}`,
  paymentInstructions: getVietQrInstructions(reservation.depositAmount, `COC ${reservation.code}`),
  tableOrder: reservation.status === 'CHECKED_IN' && reservation.table?.qrCodeToken
    ? { tableNumber: reservation.table.tableNumber, qrCodeToken: reservation.table.qrCodeToken }
    : null
});

export class ReservationsService {
  static async requireCheckedInToken(tx: Prisma.TransactionClient, accessToken: string, tableId: number) {
    await tx.$queryRaw`SELECT id FROM Reservation WHERE accessToken = ${accessToken} FOR UPDATE`;
    const reservation = await tx.reservation.findUnique({ where: { accessToken } });
    if (!reservation || reservation.status !== 'CHECKED_IN' || reservation.tableId !== tableId || !['PAID', 'APPLIED_TO_BILL'].includes(reservation.depositStatus)) {
      throw ApiError.notFound('Mã đặt bàn không hợp lệ hoặc chưa được check-in');
    }
    return reservation;
  }

  static async cancelByRestaurant(reservationId: number, input: StaffCancellationInput, actorId: number, actorName: string) {
    const reservation = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
      const current = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!current) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
      if (!['PENDING_DEPOSIT', 'CONFIRMED'].includes(current.status)) throw ApiError.conflict('Đặt bàn hiện không thể hủy');

      let depositStatus: 'UNPAID' | 'REFUND_PENDING' = 'UNPAID';
      if (current.depositStatus === 'PAID') {
        await tx.reservationDepositTransaction.create({ data: {
          reservationId, type: 'REFUND', status: 'PENDING', amount: current.depositAmount, reason: input.reason
        } });
        depositStatus = 'REFUND_PENDING';
      }
      const updated = await tx.reservation.update({ where: { id: reservationId }, data: {
        status: 'CANCELLED', depositStatus, cancelledAt: new Date(), cancelReason: input.reason
      } });
      await AuditService.logInTransaction(tx, {
        action: 'RESERVATION_CANCELLED_BY_RESTAURANT', targetType: 'Reservation', targetId: reservationId,
        actorId, actorName, metadata: { reason: input.reason, refundAmount: current.depositStatus === 'PAID' ? current.depositAmount : 0 }
      });
      return updated;
    });
    emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
    return reservation;
  }

  static async requestCancellation(accessToken: string, input: PublicCancellationInput) {
    const reservation = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Reservation WHERE accessToken = ${accessToken} FOR UPDATE`;
      const current = await tx.reservation.findUnique({ where: { accessToken } });
      if (!current) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
      if (!['PENDING_DEPOSIT', 'CONFIRMED'].includes(current.status)) throw ApiError.conflict('Đặt bàn hiện không thể hủy');
      if (current.scheduledAt.getTime() <= Date.now()) throw ApiError.conflict('Đặt bàn đã đến giờ; vui lòng liên hệ nhà hàng');

      let depositStatus: 'UNPAID' | 'FORFEITED' | 'REFUND_PENDING' = 'UNPAID';
      if (current.depositStatus === 'PAID') {
        const minutesUntilReservation = Math.floor((current.scheduledAt.getTime() - Date.now()) / 60_000);
        const refundPercent = minutesUntilReservation >= current.freeCancelBeforeMinutesSnapshot
          ? 100 : current.lateCancelRefundPercentSnapshot;
        const refundAmount = Math.floor(current.depositAmount * refundPercent / 100);
        const forfeitedAmount = current.depositAmount - refundAmount;
        if (forfeitedAmount > 0) await tx.reservationDepositTransaction.create({ data: {
          reservationId: current.id, type: 'FORFEIT', status: 'SUCCESS', amount: forfeitedAmount,
          reason: input.reason, confirmedAt: new Date()
        } });
        if (refundAmount > 0) {
          await tx.reservationDepositTransaction.create({ data: {
            reservationId: current.id, type: refundAmount === current.depositAmount ? 'REFUND' : 'PARTIAL_REFUND',
            status: 'PENDING', amount: refundAmount, reason: input.reason
          } });
          depositStatus = 'REFUND_PENDING';
        } else {
          depositStatus = 'FORFEITED';
        }
      }

      const updated = await tx.reservation.update({ where: { id: current.id }, data: {
        status: 'CANCELLED', depositStatus, cancelledAt: new Date(), cancelReason: input.reason
      } });
      await AuditService.logInTransaction(tx, {
        action: 'RESERVATION_CANCELLED_BY_CUSTOMER', targetType: 'Reservation', targetId: current.id,
        metadata: { reason: input.reason, depositStatus }
      });
      return updated;
    });
    emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
    return publicDto(reservation);
  }

  static async list(query: ReservationListQuery) {
    const where: Prisma.ReservationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.depositStatus ? { depositStatus: query.depositStatus } : {}),
      ...(query.search ? { OR: [
        { code: { contains: query.search } },
        { contactName: { contains: query.search } },
        { contactPhone: { contains: query.search.replace(/\D/g, '') || query.search } }
      ] } : {}),
      ...(query.from || query.to ? { scheduledAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {})
    };
    const [totalRows, items] = await Promise.all([
      prisma.reservation.count({ where }),
      prisma.reservation.findMany({
        where, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        include: { customer: { select: { id: true, name: true, phone: true } }, table: { select: { id: true, tableNumber: true, displayName: true } } }
      })
    ]);
    return {
      items: items.map(({ accessToken: _accessToken, ...item }) => item),
      pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.ceil(totalRows / query.pageSize) }
    };
  }

  static async getStaffDetail(reservationId: number) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        customer: { include: { group: true } }, table: true,
        transactions: { orderBy: { createdAt: 'desc' } }, changes: { orderBy: { createdAt: 'desc' } }
      }
    });
    if (!reservation) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
    const { accessToken: _accessToken, ...staffReservation } = reservation;
    return staffReservation;
  }

  static async confirmDeposit(reservationId: number, input: ConfirmDepositInput, actorId: number, actorName: string) {
    try {
      const reservation = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
        const current = await tx.reservation.findUnique({ where: { id: reservationId } });
        if (!current) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
        if (current.status !== 'PENDING_DEPOSIT' || current.depositStatus !== 'WAITING_CONFIRMATION') {
          throw ApiError.conflict('Đặt bàn không còn chờ xác nhận tiền cọc');
        }
        if (input.amount !== current.depositAmount) throw ApiError.badRequest('Số tiền xác nhận phải khớp với tiền cọc yêu cầu');

        const confirmedAt = new Date();
        await tx.reservationDepositTransaction.create({ data: {
          reservationId, type: 'DEPOSIT', status: 'SUCCESS', amount: input.amount,
          paymentMethod: input.paymentMethod, externalReference: input.externalReference,
          confirmedByUserId: actorId, confirmedAt
        } });
        const updated = await tx.reservation.update({
          where: { id: reservationId }, data: { status: 'CONFIRMED', depositStatus: 'PAID' }
        });
        await AuditService.logInTransaction(tx, {
          action: 'RESERVATION_DEPOSIT_CONFIRMED', targetType: 'Reservation', targetId: reservationId,
          actorId, actorName,
          metadata: { amount: input.amount, paymentMethod: input.paymentMethod, externalReference: input.externalReference }
        });
        return updated;
      });
      emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
      return reservation;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw ApiError.conflict('Mã giao dịch này đã được ghi nhận');
      }
      throw error;
    }
  }

  static async rejectDeposit(reservationId: number, input: RejectDepositInput, actorId: number, actorName: string) {
    const reservation = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
      const current = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!current) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
      if (current.status !== 'PENDING_DEPOSIT' || current.depositStatus !== 'WAITING_CONFIRMATION') {
        throw ApiError.conflict('Đặt bàn không còn chờ xác nhận tiền cọc');
      }
      await tx.reservationDepositTransaction.create({ data: {
        reservationId, type: 'DEPOSIT', status: 'REJECTED', amount: current.depositAmount, reason: input.reason,
        confirmedByUserId: actorId, confirmedAt: new Date()
      } });
      const updated = await tx.reservation.update({ where: { id: reservationId }, data: {
        depositStatus: 'UNPAID', paymentDeclaredAt: null
      } });
      await AuditService.logInTransaction(tx, {
        action: 'RESERVATION_DEPOSIT_REJECTED', targetType: 'Reservation', targetId: reservationId,
        actorId, actorName, metadata: { reason: input.reason }
      });
      return updated;
    });
    emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
    return reservation;
  }

  static async refundDeposit(reservationId: number, input: RefundDepositInput, actorId: number, actorName: string) {
    try {
      const reservation = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
        const current = await tx.reservation.findUnique({ where: { id: reservationId } });
        if (!current) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
        if (!['PAID', 'REFUND_PENDING'].includes(current.depositStatus)) throw ApiError.conflict('Đặt bàn không có khoản cọc chờ hoàn');
        const movements = await tx.reservationDepositTransaction.findMany({
          where: { reservationId, status: 'SUCCESS' }, select: { type: true, amount: true }
        });
        const received = movements.filter(row => row.type === 'DEPOSIT').reduce((sum, row) => sum + row.amount, 0);
        const alreadyRefunded = movements.filter(row => row.type === 'REFUND' || row.type === 'PARTIAL_REFUND').reduce((sum, row) => sum + row.amount, 0);
        const alreadyApplied = movements.filter(row => row.type === 'APPLY_TO_BILL' || row.type === 'FORFEIT').reduce((sum, row) => sum + row.amount, 0);
        const refundable = received - alreadyRefunded - alreadyApplied;
        if (input.amount > refundable) throw ApiError.badRequest('Số tiền hoàn vượt quá tiền cọc còn lại');
        if (current.depositStatus === 'REFUND_PENDING') {
          const pendingRefunds = await tx.reservationDepositTransaction.findMany({
            where: { reservationId, status: 'PENDING', type: { in: ['REFUND', 'PARTIAL_REFUND'] } }, select: { amount: true }
          });
          const expectedAmount = pendingRefunds.reduce((sum, row) => sum + row.amount, 0);
          if (input.amount !== expectedAmount) throw ApiError.conflict('Số tiền hoàn phải khớp với khoản hoàn đang chờ xử lý');
        }

        const now = new Date();
        await tx.reservationDepositTransaction.create({ data: {
          reservationId, type: input.amount === current.depositAmount ? 'REFUND' : 'PARTIAL_REFUND', status: 'SUCCESS',
          amount: input.amount, paymentMethod: 'BANK_TRANSFER', externalReference: input.externalReference,
          reason: input.reason, confirmedByUserId: actorId, confirmedAt: now
        } });
        const remainingAfterRefund = refundable - input.amount;
        const updated = await tx.reservation.update({ where: { id: reservationId }, data: {
          depositStatus: remainingAfterRefund === 0 ? 'REFUNDED' : 'PAID'
        } });
        await AuditService.logInTransaction(tx, {
          action: 'RESERVATION_DEPOSIT_REFUNDED', targetType: 'Reservation', targetId: reservationId,
          actorId, actorName, metadata: { amount: input.amount, externalReference: input.externalReference, reason: input.reason }
        });
        return updated;
      });
      emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
      return reservation;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw ApiError.conflict('Mã giao dịch này đã được ghi nhận');
      throw error;
    }
  }

  static async reschedule(reservationId: number, input: RescheduleReservationInput, actorId: number, actorName: string) {
    const reservation = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
      const current = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!current) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
      if (current.status !== 'CONFIRMED' || current.depositStatus !== 'PAID') throw ApiError.conflict('Chỉ đổi lịch đặt bàn đã xác nhận và đã thanh toán cọc');
      if (input.newScheduledAt.getTime() <= Date.now()) throw ApiError.badRequest('Lịch mới phải ở thời gian tương lai');
      await tx.reservationChange.create({ data: {
        reservationId, oldScheduledAt: current.scheduledAt, newScheduledAt: input.newScheduledAt,
        reason: input.reason, changedByUserId: actorId
      } });
      const updated = await tx.reservation.update({ where: { id: reservationId }, data: { scheduledAt: input.newScheduledAt } });
      await AuditService.logInTransaction(tx, {
        action: 'RESERVATION_RESCHEDULED', targetType: 'Reservation', targetId: reservationId,
        actorId, actorName, metadata: { from: current.scheduledAt.toISOString(), to: input.newScheduledAt.toISOString(), reason: input.reason }
      });
      return updated;
    });
    emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
    return reservation;
  }

  static async markNoShow(reservationId: number, input: MarkNoShowInput, actorId: number, actorName: string) {
    const reservation = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
      const current = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!current) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
      if (current.status !== 'CONFIRMED' || current.depositStatus !== 'PAID') throw ApiError.conflict('Chỉ đánh dấu vắng với đặt bàn đã xác nhận và còn tiền cọc');
      const allowedAt = current.scheduledAt.getTime() + current.gracePeriodMinutesSnapshot * 60_000;
      if (Date.now() < allowedAt) throw ApiError.conflict('Chưa hết thời gian chờ khách đến');

      const refundable = Math.floor(current.depositAmount * current.noShowRefundPercentSnapshot / 100);
      let depositStatus: 'FORFEITED' | 'REFUND_PENDING' = 'FORFEITED';
      if (refundable > 0) {
        const forfeited = current.depositAmount - refundable;
        if (forfeited > 0) await tx.reservationDepositTransaction.create({ data: {
          reservationId, type: 'FORFEIT', status: 'SUCCESS', amount: forfeited, reason: input.reason,
          confirmedByUserId: actorId, confirmedAt: new Date()
        } });
        await tx.reservationDepositTransaction.create({ data: {
          reservationId, type: refundable === current.depositAmount ? 'REFUND' : 'PARTIAL_REFUND',
          status: 'PENDING', amount: refundable, reason: input.reason
        } });
        depositStatus = 'REFUND_PENDING';
      } else {
        await tx.reservationDepositTransaction.create({ data: {
          reservationId, type: 'FORFEIT', status: 'SUCCESS', amount: current.depositAmount,
          reason: input.reason, confirmedByUserId: actorId, confirmedAt: new Date()
        } });
      }
      const updated = await tx.reservation.update({ where: { id: reservationId }, data: { status: 'NO_SHOW', depositStatus } });
      await AuditService.logInTransaction(tx, {
        action: 'RESERVATION_MARKED_NO_SHOW', targetType: 'Reservation', targetId: reservationId,
        actorId, actorName, metadata: { reason: input.reason, refundableAmount: refundable }
      });
      return updated;
    });
    emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
    return reservation;
  }

  static async checkIn(reservationId: number, input: CheckInReservationInput, actorId: number, actorName: string) {
    const reservation = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${input.tableId} FOR UPDATE`;
      const current = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!current) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
      if (current.status !== 'CONFIRMED' || current.depositStatus !== 'PAID') throw ApiError.conflict('Chỉ check-in đặt bàn đã xác nhận và đã thanh toán cọc');
      const table = await tx.diningTable.findUnique({ where: { id: input.tableId } });
      if (!table || !table.isActive) throw ApiError.badRequest('Bàn không tồn tại hoặc đã ngừng hoạt động');
      if (table.status !== 'AVAILABLE') throw ApiError.conflict('Bàn hiện không khả dụng');
      if (table.capacity < current.partySize) throw ApiError.badRequest('Sức chứa của bàn không đủ số khách');
      const occupiedReservation = await tx.reservation.findFirst({ where: { tableId: table.id, status: 'CHECKED_IN' } });
      if (occupiedReservation) throw ApiError.conflict('Bàn đang được sử dụng bởi lượt đặt chỗ khác');

      const checkedInAt = new Date();
      const updated = await tx.reservation.update({ where: { id: reservationId }, data: {
        status: 'CHECKED_IN', tableId: table.id, checkedInAt, checkedInByUserId: actorId
      } });
      await tx.diningTable.update({ where: { id: table.id }, data: { status: 'OCCUPIED' } });
      await AuditService.logInTransaction(tx, {
        action: 'RESERVATION_CHECKED_IN', targetType: 'Reservation', targetId: reservationId,
        actorId, actorName, metadata: { tableId: table.id, tableNumber: table.tableNumber, checkedInAt: checkedInAt.toISOString() }
      });
      return updated;
    });
    emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
    emitToAll('tables:changed', { ids: [input.tableId], updatedAt: new Date().toISOString() });
    return reservation;
  }

  static async createPublic(input: CreatePublicReservationInput) {
    if (input.scheduledAt.getTime() <= Date.now()) throw ApiError.badRequest('Thời gian đặt bàn phải ở tương lai');
    const phone = normalizePhone(input.phone);
    const reservation = await prisma.$transaction(async tx => {
      const policy = await tx.reservationPolicy.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
      if (!policy) throw ApiError.badRequest('Nhà hàng chưa cấu hình chính sách đặt cọc');
      let customer = await tx.customer.findUnique({ where: { phone } });
      if (customer && !customer.isActive) throw ApiError.badRequest('Khách hàng đã ngừng hoạt động');
      if (!customer) {
        const last = await tx.customer.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
        customer = await tx.customer.create({ data: { code: `KH${String((last?.id ?? 0) + 1).padStart(6, '0')}`, name: input.name, phone } });
      }
      const prefix = bookingPrefix(new Date());
      const lastCodes = await tx.$queryRaw<Array<{ code: string }>>`SELECT code FROM Reservation WHERE code LIKE ${`${prefix}%`} ORDER BY code DESC LIMIT 1 FOR UPDATE`;
      const lastSequence = lastCodes[0] ? Number(lastCodes[0].code.slice(prefix.length)) : 0;
      const code = `${prefix}${String(lastSequence + 1).padStart(4, '0')}`;
      return tx.reservation.create({ data: {
        code, accessToken: randomBytes(32).toString('hex'), customerId: customer.id, policyId: policy.id,
        scheduledAt: input.scheduledAt, partySize: input.partySize, contactName: input.name, contactPhone: phone, note: input.note,
        depositAmount: policy.depositAmount, freeCancelBeforeMinutesSnapshot: policy.freeCancelBeforeMinutes,
        lateCancelRefundPercentSnapshot: policy.lateCancelRefundPercent, noShowRefundPercentSnapshot: policy.noShowRefundPercent,
        gracePeriodMinutesSnapshot: policy.gracePeriodMinutes
      } });
    });
    emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
    return publicDto(reservation);
  }

  static async getPublic(accessToken: string) {
    const reservation = await prisma.reservation.findUnique({ where: { accessToken }, include: { table: { select: { tableNumber: true, qrCodeToken: true } } } });
    if (!reservation) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
    return publicDto(reservation);
  }

  static async declarePayment(accessToken: string) {
    const reservation = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Reservation WHERE accessToken = ${accessToken} FOR UPDATE`;
      const current = await tx.reservation.findUnique({ where: { accessToken } });
      if (!current) throw ApiError.notFound('Không tìm thấy thông tin đặt bàn');
      if (current.status !== 'PENDING_DEPOSIT') throw ApiError.conflict('Đặt bàn không còn chờ thanh toán cọc');
      if (current.depositStatus === 'UNPAID') {
        return tx.reservation.update({ where: { id: current.id }, data: { depositStatus: 'WAITING_CONFIRMATION', paymentDeclaredAt: new Date() } });
      }
      if (current.depositStatus === 'WAITING_CONFIRMATION') return current;
      throw ApiError.conflict('Trạng thái cọc không hợp lệ');
    });
    emitToAll('reservations:changed', { ids: [reservation.id], updatedAt: new Date().toISOString() });
    return publicDto(reservation);
  }
}
