import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, truncateAllTables } from '../helpers/database';

const futureReservationSlot = (hour = 12) => {
  const slot = new Date();
  slot.setUTCDate(slot.getUTCDate() + 7);
  slot.setUTCHours(hour, 0, 0, 0);
  return slot.toISOString();
};

describe('public reservations API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await prismaTest.reservationPolicy.create({ data: { name: 'Mặc định', depositAmount: 300000, freeCancelBeforeMinutes: 120, lateCancelRefundPercent: 0, noShowRefundPercent: 0, gracePeriodMinutes: 30 } });
  });

  it('creates an unpaid booking with a policy snapshot and bank-transfer instruction', async () => {
    const response = await request(app).post('/api/reservations').send({
      name: 'Nguyễn Văn A', phone: '0903 000 280', scheduledAt: futureReservationSlot(), partySize: 4, note: 'Bàn gần cửa sổ'
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      code: expect.stringMatching(/^BK\d{8}\d{4}$/), depositStatus: 'UNPAID', status: 'PENDING_DEPOSIT', depositAmount: 300000,
      transferContent: expect.stringMatching(/^COC BK\d{8}\d{4}$/)
    });
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.accessToken.length).toBeGreaterThan(30);
  });

  it('moves a booking to waiting confirmation once and never records a receipt from a guest declaration', async () => {
    const booking = await request(app).post('/api/reservations').send({ name: 'Trần B', phone: '0903000281', scheduledAt: futureReservationSlot(), partySize: 2 });
    const token = booking.body.data.accessToken;

    expect((await request(app).post(`/api/reservations/public/${token}/payment-declaration`).send({})).status).toBe(200);
    const repeated = await request(app).post(`/api/reservations/public/${token}/payment-declaration`).send({});
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.depositStatus).toBe('WAITING_CONFIRMATION');
    expect(await prismaTest.reservationDepositTransaction.count()).toBe(0);
  });

  it('issues distinct booking codes for different reservation slots created on the same day', async () => {
    const first = await request(app).post('/api/reservations').send({ name: 'Khách Một', phone: '0903000282', scheduledAt: futureReservationSlot(12), partySize: 2 });
    const second = await request(app).post('/api/reservations').send({ name: 'Khách Hai', phone: '0903000283', scheduledAt: futureReservationSlot(13), partySize: 2 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.code).not.toBe(first.body.data.code);
  });
});
