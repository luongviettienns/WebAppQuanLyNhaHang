import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('reservation deposit reconciliation API', () => {
  let cashierId: number;
  let cashierToken: string;

  beforeEach(async () => {
    await truncateAllTables();
    await prismaTest.reservationPolicy.create({
      data: { name: 'Mặc định', depositAmount: 300000, freeCancelBeforeMinutes: 120, lateCancelRefundPercent: 0, noShowRefundPercent: 0, gracePeriodMinutes: 30 }
    });
    const cashier = await prismaTest.user.create({
      data: { username: `reservation-cashier-${Date.now()}`, passwordHash: 'hash', name: 'Thu ngân', role: 'CASHIER' }
    });
    cashierId = cashier.id;
    cashierToken = jwt.sign(
      { sub: String(cashier.id), username: cashier.username, name: cashier.name, role: cashier.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  async function createWaitingReservation(phone: string) {
    const created = await request(app).post('/api/reservations').send({
      name: 'Nguyễn Văn A', phone, scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), partySize: 4
    });
    const declared = await request(app).post(`/api/reservations/public/${created.body.data.accessToken}/payment-declaration`).send({});
    expect(created.status).toBe(201);
    expect(declared.status).toBe(200);
    const reservation = await prismaTest.reservation.findUniqueOrThrow({ where: { accessToken: created.body.data.accessToken } });
    return { ...created.body.data, id: reservation.id };
  }

  async function confirmReservation(booking: { id: number }) {
    return request(app)
      .post(`/api/reservations/${booking.id}/deposit/confirm`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ amount: 300000, paymentMethod: 'BANK_TRANSFER', externalReference: `COC-${booking.id}` });
  }

  it('confirms a declared deposit by appending one successful receipt and an audit record', async () => {
    const booking = await createWaitingReservation('0903000201');

    const response = await request(app)
      .post(`/api/reservations/${booking.id}/deposit/confirm`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ amount: 300000, paymentMethod: 'BANK_TRANSFER', externalReference: 'COC-BANK-001' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'CONFIRMED', depositStatus: 'PAID' });
    const transactions = await prismaTest.reservationDepositTransaction.findMany({ where: { reservationId: booking.id } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      type: 'DEPOSIT', status: 'SUCCESS', amount: 300000, paymentMethod: 'BANK_TRANSFER',
      externalReference: 'COC-BANK-001', confirmedByUserId: cashierId
    });
    expect(transactions[0].confirmedAt).toBeInstanceOf(Date);
    expect(await prismaTest.auditLog.count({ where: { action: 'RESERVATION_DEPOSIT_CONFIRMED', targetId: booking.id } })).toBe(1);
  });

  it('lists staff reservation details without exposing the guest access token', async () => {
    const booking = await createWaitingReservation('0903000209');

    const list = await request(app)
      .get('/api/reservations?depositStatus=WAITING_CONFIRMATION')
      .set('Authorization', `Bearer ${cashierToken}`);
    const detail = await request(app)
      .get(`/api/reservations/${booking.id}`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0]).toMatchObject({ code: booking.code, status: 'PENDING_DEPOSIT', depositStatus: 'WAITING_CONFIRMATION', depositAmount: 300000 });
    expect(list.body.data.items[0]).not.toHaveProperty('accessToken');
    expect(detail.status).toBe(200);
    expect(detail.body.data.customer).toMatchObject({ name: 'Nguyễn Văn A', phone: '0903000209' });
    expect(detail.body.data).not.toHaveProperty('accessToken');
  });

  it('rejects a declared deposit with a reason and returns the booking to unpaid', async () => {
    const booking = await createWaitingReservation('0903000202');

    const response = await request(app)
      .post(`/api/reservations/${booking.id}/deposit/reject`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ reason: 'Không tìm thấy giao dịch tương ứng' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'PENDING_DEPOSIT', depositStatus: 'UNPAID' });
    const rejection = await prismaTest.reservationDepositTransaction.findFirstOrThrow({ where: { reservationId: booking.id } });
    expect(rejection).toMatchObject({ type: 'DEPOSIT', status: 'REJECTED', amount: 300000, reason: 'Không tìm thấy giao dịch tương ứng' });
    expect(await prismaTest.auditLog.count({ where: { action: 'RESERVATION_DEPOSIT_REJECTED', targetId: booking.id } })).toBe(1);
  });

  it('prevents confirming a booking twice without creating a second receipt', async () => {
    const booking = await createWaitingReservation('0903000203');
    expect((await confirmReservation(booking)).status).toBe(200);

    const repeated = await confirmReservation(booking);

    expect(repeated.status).toBe(409);
    expect(await prismaTest.reservationDepositTransaction.count({ where: { reservationId: booking.id, status: 'SUCCESS' } })).toBe(1);
  });

  it('refunds a paid deposit by appending a successful refund transaction', async () => {
    const booking = await createWaitingReservation('0903000204');
    expect((await confirmReservation(booking)).status).toBe(200);

    const response = await request(app)
      .post(`/api/reservations/${booking.id}/deposit/refund`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ amount: 300000, externalReference: 'REFUND-001', reason: 'Nhà hàng hủy đặt bàn' });

    expect(response.status).toBe(200);
    expect(response.body.data.depositStatus).toBe('REFUNDED');
    expect(await prismaTest.reservationDepositTransaction.findFirst({ where: { reservationId: booking.id, type: 'REFUND', status: 'SUCCESS' } })).toMatchObject({
      amount: 300000, externalReference: 'REFUND-001', reason: 'Nhà hàng hủy đặt bàn', confirmedByUserId: cashierId
    });
  });

  it('reschedules a confirmed reservation without changing its paid deposit', async () => {
    const booking = await createWaitingReservation('0903000205');
    expect((await confirmReservation(booking)).status).toBe(200);
    const newScheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const response = await request(app)
      .post(`/api/reservations/${booking.id}/reschedule`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ newScheduledAt, reason: 'Khách xin đổi ngày' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'CONFIRMED', depositStatus: 'PAID', scheduledAt: newScheduledAt });
    expect(await prismaTest.reservationChange.findFirst({ where: { reservationId: booking.id } })).toMatchObject({
      newScheduledAt: new Date(newScheduledAt), reason: 'Khách xin đổi ngày', changedByUserId: cashierId
    });
  });

  it('marks a confirmed booking no-show after grace and records the forfeiture', async () => {
    const booking = await createWaitingReservation('0903000206');
    expect((await confirmReservation(booking)).status).toBe(200);
    const pastSchedule = new Date(Date.now() - 60 * 60 * 1000);
    await prismaTest.reservation.update({ where: { id: booking.id }, data: { scheduledAt: pastSchedule } });

    const response = await request(app)
      .post(`/api/reservations/${booking.id}/no-show`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ reason: 'Khách không đến sau thời gian chờ' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'NO_SHOW', depositStatus: 'FORFEITED' });
    expect(await prismaTest.reservationDepositTransaction.findFirst({ where: { reservationId: booking.id, type: 'FORFEIT' } })).toMatchObject({
      status: 'SUCCESS', amount: 300000, reason: 'Khách không đến sau thời gian chờ', confirmedByUserId: cashierId
    });
  });

  it('requires a no-show refund to match the refund amount snapshotted for that booking', async () => {
    const booking = await createWaitingReservation('0903000208');
    expect((await confirmReservation(booking)).status).toBe(200);
    const pastSchedule = new Date(Date.now() - 60 * 60 * 1000);
    await prismaTest.reservation.update({ where: { id: booking.id }, data: { scheduledAt: pastSchedule, noShowRefundPercentSnapshot: 50 } });
    expect((await request(app)
      .post(`/api/reservations/${booking.id}/no-show`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ reason: 'Khách đến trễ' })).status).toBe(200);

    const response = await request(app)
      .post(`/api/reservations/${booking.id}/deposit/refund`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ amount: 100000, externalReference: 'NO-SHOW-REFUND-001', reason: 'Hoàn theo chính sách' });

    expect(response.status).toBe(409);
    expect((await prismaTest.reservation.findUniqueOrThrow({ where: { id: booking.id } })).depositStatus).toBe('REFUND_PENDING');
    expect(await prismaTest.reservationDepositTransaction.count({ where: { reservationId: booking.id, status: 'SUCCESS', type: { in: ['REFUND', 'PARTIAL_REFUND'] } } })).toBe(0);

    const approvedRefund = await request(app)
      .post(`/api/reservations/${booking.id}/deposit/refund`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ amount: 150000, externalReference: 'NO-SHOW-REFUND-002', reason: 'Hoàn theo chính sách' });
    expect(approvedRefund.status).toBe(200);
    expect(approvedRefund.body.data.depositStatus).toBe('REFUNDED');
  });

  it('calculates free cancellation from the booking snapshot and queues the full refund', async () => {
    const booking = await createWaitingReservation('0903000210');
    expect((await confirmReservation(booking)).status).toBe(200);
    const scheduledAt = new Date(Date.now() + 180 * 60 * 1000);
    await prismaTest.reservation.update({ where: { id: booking.id }, data: { scheduledAt } });
    await prismaTest.reservationPolicy.updateMany({ data: { freeCancelBeforeMinutes: 300, lateCancelRefundPercent: 0 } });

    const response = await request(app)
      .post(`/api/reservations/public/${booking.accessToken}/cancellation-request`)
      .send({ reason: 'Khách đổi kế hoạch' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'CANCELLED', depositStatus: 'REFUND_PENDING' });
    expect(await prismaTest.reservationDepositTransaction.findFirst({ where: { reservationId: booking.id, status: 'PENDING' } })).toMatchObject({ type: 'REFUND', amount: 300000 });
  });

  it('applies the snapshotted late-cancellation percentage and forfeits the remainder', async () => {
    const booking = await createWaitingReservation('0903000211');
    expect((await confirmReservation(booking)).status).toBe(200);
    await prismaTest.reservation.update({ where: { id: booking.id }, data: {
      scheduledAt: new Date(Date.now() + 30 * 60 * 1000), lateCancelRefundPercentSnapshot: 25
    } });
    await prismaTest.reservationPolicy.updateMany({ data: { lateCancelRefundPercent: 100 } });

    const response = await request(app)
      .post(`/api/reservations/public/${booking.accessToken}/cancellation-request`)
      .send({ reason: 'Khách hủy sát giờ' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'CANCELLED', depositStatus: 'REFUND_PENDING' });
    expect(await prismaTest.reservationDepositTransaction.findFirst({ where: { reservationId: booking.id, type: 'FORFEIT' } })).toMatchObject({ status: 'SUCCESS', amount: 225000 });
    expect(await prismaTest.reservationDepositTransaction.findFirst({ where: { reservationId: booking.id, type: 'PARTIAL_REFUND' } })).toMatchObject({ status: 'PENDING', amount: 75000 });
  });

  it('queues a full refund when staff cancels a paid reservation for the restaurant', async () => {
    const booking = await createWaitingReservation('0903000212');
    expect((await confirmReservation(booking)).status).toBe(200);

    const response = await request(app)
      .post(`/api/reservations/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ reason: 'Nhà hàng không thể phục vụ khung giờ này' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'CANCELLED', depositStatus: 'REFUND_PENDING' });
    expect(await prismaTest.reservationDepositTransaction.findFirst({ where: { reservationId: booking.id, status: 'PENDING' } })).toMatchObject({ type: 'REFUND', amount: 300000, reason: 'Nhà hàng không thể phục vụ khung giờ này' });
  });

  it('checks in a paid booking and marks the selected active table occupied', async () => {
    const booking = await createWaitingReservation('0903000207');
    expect((await confirmReservation(booking)).status).toBe(200);
    const area = await prismaTest.tableArea.create({ data: { name: 'Khu A' } });
    const table = await prismaTest.diningTable.create({
      data: { tableNumber: 1, qrCodeToken: 'qr_reservation_checkin_00000001', areaId: area.id, capacity: 4 }
    });

    const response = await request(app)
      .post(`/api/reservations/${booking.id}/check-in`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ tableId: table.id });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'CHECKED_IN', depositStatus: 'PAID', tableId: table.id, checkedInByUserId: cashierId });
    expect((await prismaTest.diningTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe('OCCUPIED');
    expect(await prismaTest.auditLog.count({ where: { action: 'RESERVATION_CHECKED_IN', targetId: booking.id } })).toBe(1);
  });
});
