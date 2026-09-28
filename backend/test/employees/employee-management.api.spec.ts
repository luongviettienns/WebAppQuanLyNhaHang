import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee management API', () => {
  let adminToken: string;
  let cashierToken: string;
  let nextPhone = 90000000;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sign = (user: { id: number; username: string; name: string; role: 'ADMIN' | 'CASHIER' | 'KITCHEN' }) => jwt.sign(
    { sub: String(user.id), username: user.username, name: user.name, role: user.role },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
  );

  const employeePayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Nguyễn Minh Anh',
    phone: `09${String(++nextPhone).padStart(8, '0')}`,
    ...overrides
  });

  const createEmployee = (overrides: Record<string, unknown> = {}) => request(app)
    .post('/api/employees')
    .set(auth(adminToken))
    .send(employeePayload(overrides));

  beforeEach(async () => {
    await truncateAllTables();
    nextPhone = 90000000;
    const [admin, cashier] = await Promise.all([
      prismaTest.user.create({ data: { username: `employee-admin-${Date.now()}`, passwordHash: 'admin-hash', name: 'Quản lý', role: 'ADMIN' } }),
      prismaTest.user.create({ data: { username: `employee-cashier-${Date.now()}`, passwordHash: 'cashier-hash', name: 'Thu ngân', role: 'CASHIER' } })
    ]);
    adminToken = sign(admin);
    cashierToken = sign(cashier);
  });

  it('rejects employee APIs for non-admin', async () => {
    expect((await request(app).get('/api/employees')).status).toBe(401);
    expect((await request(app).get('/api/employees').set(auth(cashierToken))).status).toBe(403);
    expect((await request(app).post('/api/employees').set(auth(cashierToken)).send(employeePayload())).status).toBe(403);
  });

  it('filters and paginates employee list with database-wide status counts', async () => {
    const department = await request(app).post('/api/employees/departments').set(auth(adminToken)).send({ name: 'Phục vụ' });
    const jobTitle = await request(app).post('/api/employees/job-titles').set(auth(adminToken)).send({ name: 'Nhân viên phục vụ' });
    expect(department.status).toBe(201);
    expect(jobTitle.status).toBe(201);

    const matching = await createEmployee({ departmentId: department.body.data.id, jobTitleId: jobTitle.body.data.id });
    const resigned = await createEmployee({ name: 'Trần Thu Hà' });
    const other = await createEmployee({ name: 'Lê Quốc Bảo' });
    expect([matching.status, resigned.status, other.status]).toEqual([201, 201, 201]);
    await request(app).patch(`/api/employees/${resigned.body.data.id}/status`).set(auth(adminToken)).send({ status: 'RESIGNED', endDate: '2026-09-20' });

    const filtered = await request(app).get(`/api/employees?search=${matching.body.data.phone}&status=WORKING&departmentId=${department.body.data.id}&jobTitleId=${jobTitle.body.data.id}&page=1&pageSize=1`).set(auth(adminToken));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items.map((employee: { id: number }) => employee.id)).toEqual([matching.body.data.id]);
    expect(filtered.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, totalRows: 1, totalPages: 1 });
    expect(filtered.body.data.summary).toEqual({ totalCount: 3, workingCount: 2, resignedCount: 1 });
  });

  it('creates an employee with server-generated employee and attendance codes', async () => {
    const [first, second] = await Promise.all([createEmployee({ code: 'NV999999', attendanceCode: 'CC999999' }), createEmployee()]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.code).toMatch(/^NV\d{6,}$/);
    expect(first.body.data.attendanceCode).toMatch(/^CC\d{6,}$/);
    expect(second.body.data.code).not.toBe(first.body.data.code);
    expect(second.body.data.attendanceCode).not.toBe(first.body.data.attendanceCode);
    expect(first.body.data).not.toMatchObject({ code: 'NV999999', attendanceCode: 'CC999999' });
  });

  it('creates department and job title values inline for an employee', async () => {
    const department = await request(app).post('/api/employees/departments').set(auth(adminToken)).send({ name: 'Bếp nóng' });
    const jobTitle = await request(app).post('/api/employees/job-titles').set(auth(adminToken)).send({ name: 'Đầu bếp' });
    expect(department.status).toBe(201);
    expect(jobTitle.status).toBe(201);
    const created = await createEmployee({ departmentId: department.body.data.id, jobTitleId: jobTitle.body.data.id });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ department: { name: 'Bếp nóng' }, jobTitle: { name: 'Đầu bếp' } });
  });

  it('allows editing an employee while preserving already-assigned inactive department and job title', async () => {
    const department = await request(app).post('/api/employees/departments').set(auth(adminToken)).send({ name: 'Phòng cũ' });
    const jobTitle = await request(app).post('/api/employees/job-titles').set(auth(adminToken)).send({ name: 'Chức danh cũ' });
    const employee = await createEmployee({ departmentId: department.body.data.id, jobTitleId: jobTitle.body.data.id });
    await request(app).patch(`/api/employees/departments/${department.body.data.id}`).set(auth(adminToken)).send({ isActive: false });
    await request(app).patch(`/api/employees/job-titles/${jobTitle.body.data.id}`).set(auth(adminToken)).send({ isActive: false });

    const updated = await request(app).patch(`/api/employees/${employee.body.data.id}`).set(auth(adminToken)).send({
      name: 'Đổi tên hồ sơ', departmentId: department.body.data.id, jobTitleId: jobTitle.body.data.id
    });
    const reassignment = await createEmployee({ name: 'Nhân viên mới', departmentId: department.body.data.id, jobTitleId: jobTitle.body.data.id });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: 'Đổi tên hồ sơ', department: { id: department.body.data.id, isActive: false }, jobTitle: { id: jobTitle.body.data.id, isActive: false } });
    expect(reassignment.status).toBe(400);
  });

  it('returns private profile fields only through the Admin detail endpoint', async () => {
    const created = await createEmployee({
      nationalId: '079123456789',
      bankName: 'Ngân hàng thử nghiệm',
      bankAccountNumber: '123456789012',
      bankAccountName: 'NGUYEN MINH ANH',
      initialCompensation: { payBasis: 'MONTHLY', baseRate: 12000000, effectiveFrom: '2026-09-01' }
    });
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/employees').set(auth(adminToken));
    const detail = await request(app).get(`/api/employees/${created.body.data.id}`).set(auth(adminToken));

    expect(list.body.data.items[0].nationalId).not.toBe('079123456789');
    expect(list.body.data.items[0].nationalId).toMatch(/6789$/);
    expect(list.body.data.items[0]).not.toHaveProperty('bankAccountNumber');
    expect(list.body.data.items[0]).not.toHaveProperty('compensations');
    expect(detail.body.data).toMatchObject({ nationalId: '079123456789', bankAccountNumber: '123456789012' });
    expect(detail.body.data.compensations).toEqual([expect.objectContaining({ payBasis: 'MONTHLY', baseRate: 12000000 })]);
  });

  it('links an existing user without changing its role or password', async () => {
    const user = await prismaTest.user.create({ data: { username: 'optional-link-cashier', passwordHash: 'unchanged-hash', name: 'Tài khoản thu ngân', role: 'CASHIER' } });
    const created = await createEmployee({ userId: user.id });
    expect(created.status).toBe(201);
    const after = await prismaTest.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(created.body.data.user).toMatchObject({ id: user.id, username: user.username, role: 'CASHIER' });
    expect(after).toMatchObject({ role: 'CASHIER', passwordHash: 'unchanged-hash' });
  });

  it('rejects a user already linked to another employee', async () => {
    const user = await prismaTest.user.create({ data: { username: 'single-employee-link', passwordHash: 'same-hash', name: 'Tài khoản dùng chung', role: 'CASHIER' } });
    const first = await createEmployee({ userId: user.id });
    const second = await createEmployee({ userId: user.id, name: 'Hồ sơ thứ hai' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await prismaTest.user.count({ where: { id: user.id } })).toBe(1);
  });

  it('appends compensation without rewriting prior terms or accepting duplicate effective dates', async () => {
    const created = await createEmployee({ initialCompensation: { payBasis: 'MONTHLY', baseRate: 10000000, effectiveFrom: '2026-01-01' } });
    expect(created.status).toBe(201);
    const employeeId = created.body.data.id;
    const added = await request(app).post(`/api/employees/${employeeId}/compensations`).set(auth(adminToken)).send({ payBasis: 'MONTHLY', baseRate: 12000000, effectiveFrom: '2026-09-01', note: 'Điều chỉnh định kỳ' });
    const duplicate = await request(app).post(`/api/employees/${employeeId}/compensations`).set(auth(adminToken)).send({ payBasis: 'MONTHLY', baseRate: 13000000, effectiveFrom: '2026-09-01' });
    const detail = await request(app).get(`/api/employees/${employeeId}`).set(auth(adminToken));

    expect(added.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(detail.body.data.compensations.map((item: { baseRate: number }) => item.baseRate).sort()).toEqual([10000000, 12000000]);
  });

  it('preserves employee and compensation history when status changes', async () => {
    const created = await createEmployee({ startDate: '2026-01-05', initialCompensation: { payBasis: 'PER_SHIFT', baseRate: 350000, effectiveFrom: '2026-01-05' } });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const resigned = await request(app).patch(`/api/employees/${id}/status`).set(auth(adminToken)).send({ status: 'RESIGNED', endDate: '2026-09-20' });
    const returned = await request(app).patch(`/api/employees/${id}/status`).set(auth(adminToken)).send({ status: 'WORKING' });
    const detail = await request(app).get(`/api/employees/${id}`).set(auth(adminToken));

    expect(resigned.status).toBe(200);
    expect(resigned.body.data).toMatchObject({ status: 'RESIGNED', endDate: '2026-09-20T00:00:00.000Z' });
    expect(returned.status).toBe(200);
    expect(detail.body.data).toMatchObject({ id, status: 'WORKING', endDate: null, startDate: '2026-01-05T00:00:00.000Z' });
    expect(detail.body.data.compensations).toHaveLength(1);
  });

  it('shows only unlinked users with a narrow account summary', async () => {
    const linked = await prismaTest.user.create({ data: { username: 'already-linked', passwordHash: 'private-password', name: 'Đã liên kết', role: 'CASHIER' } });
    const available = await prismaTest.user.create({ data: { username: 'available-account', passwordHash: 'private-password', name: 'Có thể liên kết', role: 'KITCHEN' } });
    const created = await createEmployee({ userId: linked.id });
    expect(created.status).toBe(201);
    const response = await request(app).get('/api/employees/linkable-users?search=account').set(auth(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: available.id, username: available.username, name: available.name, role: available.role }]);
  });

  it('audits employee creation without copying sensitive field values', async () => {
    const created = await createEmployee({
      nationalId: '079987654321',
      bankAccountNumber: '987654321000',
      initialCompensation: { payBasis: 'HOURLY', baseRate: 45000, effectiveFrom: '2026-09-01' }
    });
    expect(created.status).toBe(201);
    const audit = await prismaTest.auditLog.findFirst({ where: { action: 'EMPLOYEE_CREATED', targetId: created.body.data.id } });
    const metadata = JSON.stringify(audit?.metadata);

    expect(audit).not.toBeNull();
    expect(metadata).not.toContain('079987654321');
    expect(metadata).not.toContain('987654321000');
    expect(metadata).not.toContain('45000');
  });

  it('treats blank optional national IDs as unset across employee profiles', async () => {
    const first = await createEmployee({ nationalId: '   ', email: '' });
    const second = await createEmployee({ nationalId: ' ', email: null });
    const firstDetail = await request(app).get(`/api/employees/${first.body.data.id}`).set(auth(adminToken));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(firstDetail.body.data).toMatchObject({ nationalId: null, email: null });
  });
});
