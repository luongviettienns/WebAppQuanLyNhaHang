import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

const headers = ['employeeCode', 'shiftCode', 'workDate', 'repeatWeekly', 'endDate'];
const csvFile = (rows: unknown[][], fileName = 'schedules.csv') => ({
  fileName,
  fileBase64: Buffer.from([headers, ...rows].map(row => row.map(value => String(value ?? '')).join(',')).join('\r\n'), 'utf8').toString('base64')
});
const xlsxFile = (rows: unknown[][], fileName = 'schedules.xlsx') => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Schedules');
  return { fileName, fileBase64: XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) };
};

describe('employee schedule import/export API', () => {
  let token = '';
  let actorId = 0;
  let employees: Array<{ id: number; code: string; name: string }> = [];
  let shifts: Array<{ id: number; code: string }> = [];
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const preview = (file: { fileName: string; fileBase64: string }) => request(app).post('/api/employee-schedules/import/preview').set(auth()).send(file);
  const commit = (rows: unknown[]) => request(app).post('/api/employee-schedules/import/commit').set(auth()).send({ rows });

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `schedule-transfer-admin-${Date.now()}`, passwordHash: 'test-hash', name: 'Schedule Admin', role: 'ADMIN' }
    });
    actorId = admin.id;
    token = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    employees = await Promise.all([
      prismaTest.employee.create({ data: { code: 'NV-SCH-001', attendanceCode: 'CC-SCH-001', name: 'Nguyễn Minh Anh', phone: '0900000001', startDate: day('2026-01-01'), nationalId: '079123456789', bankAccountNumber: '123456789012' }, select: { id: true, code: true, name: true } }),
      prismaTest.employee.create({ data: { code: 'NV-SCH-002', attendanceCode: 'CC-SCH-002', name: 'Lê Quốc Bảo', phone: '0900000002', startDate: day('2026-01-01'), status: 'RESIGNED', endDate: day('2026-09-01') }, select: { id: true, code: true, name: true } })
    ]);
    shifts = await Promise.all([
      prismaTest.workShift.create({ data: { code: 'MORNING', name: 'Ca sáng', startMinute: 480, endMinute: 720 } }),
      prismaTest.workShift.create({ data: { code: 'AFTERNOON', name: 'Ca chiều', startMinute: 780, endMinute: 1020 } }),
      prismaTest.workShift.create({ data: { code: 'EVENING', name: 'Ca tối', startMinute: 1080, endMinute: 1320 } })
    ]);
  });

  it('previews CSV and XLSX rows without writing rules or audits', async () => {
    const csv = await preview(csvFile([
      [employees[0].code, 'MORNING', '2026-10-05', 'false', ''],
      [employees[0].code, 'AFTERNOON', '2026-10-06', 'true', '2026-10-20']
    ]));
    const xlsx = await preview(xlsxFile([[employees[0].code, 'EVENING', '2026-10-07', 'false', '']]));

    expect(csv.status).toBe(200);
    expect(csv.body.data).toMatchObject({ totalRows: 2, canCommit: true, errorRows: [] });
    expect(csv.body.data.validRows[1]).toMatchObject({ rowNumber: 3, employeeCode: employees[0].code, shiftCode: 'AFTERNOON', workDate: '2026-10-06', repeatWeekly: true, endDate: '2026-10-20' });
    expect(xlsx.status).toBe(200);
    expect(xlsx.body.data.validRows[0]).toMatchObject({ employeeCode: employees[0].code, shiftCode: 'EVENING', workDate: '2026-10-07' });
    expect(await prismaTest.employeeScheduleRule.count()).toBe(0);
    expect(await prismaTest.auditLog.count()).toBe(0);
  });

  it('returns row-specific diagnostics for unknown/resigned employees, shifts, invalid dates, and recurrence bounds', async () => {
    const response = await preview(csvFile([
      ['NV-MISSING', 'MORNING', '2026-10-05', 'false', ''],
      [employees[1].code, 'MORNING', '2026-10-05', 'false', ''],
      [employees[0].code, 'MISSING', '2026-10-05', 'false', ''],
      [employees[0].code, 'MORNING', '2026-02-30', 'false', ''],
      [employees[0].code, 'MORNING', '2026-10-05', 'true', '2026-10-04'],
      [employees[0].code, 'EVENING', '2026-10-06', 'false', '2026-10-20']
    ]));

    expect(response.status).toBe(200);
    expect(response.body.data.canCommit).toBe(false);
    expect(response.body.data.validRows).toEqual([]);
    expect(response.body.data.errorRows).toHaveLength(6);
    expect(response.body.data.errorRows.map((row: { rowNumber: number }) => row.rowNumber)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(response.body.data.errorRows.some((row: { error: string }) => row.error.toLocaleLowerCase('vi').includes('không tồn tại'))).toBe(true);
    expect(response.body.data.errorRows[5].error).toContain('không nhận ngày kết thúc');
  });

  it('rejects unsupported files, missing headers, payloads over 5 MiB, and more than 1000 data rows', async () => {
    const unsupported = await preview({ fileName: 'schedules.txt', fileBase64: Buffer.from('x').toString('base64') });
    const missingHeader = await preview({ fileName: 'missing.csv', fileBase64: Buffer.from('name,date\n').toString('base64') });
    const large = await preview({ fileName: 'large.csv', fileBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') });
    const manyRows = Array.from({ length: 1001 }, () => [employees[0].code, 'MORNING', '2026-10-05', 'false', '']);
    const overLimit = await preview(csvFile(manyRows));

    expect(unsupported.status).toBe(400);
    expect(missingHeader.status).toBe(400);
    expect(large.status).toBe(400);
    expect(large.body.error.message).toContain('5 MB');
    expect(overLimit.status).toBe(400);
    expect(overLimit.body.error.message).toContain('1000');
  });

  it('previews an existing-schedule conflict and duplicate rows without partially accepting them', async () => {
    await prismaTest.employeeScheduleRule.create({
      data: { employeeId: employees[0].id, shiftId: shifts[0].id, recurrenceType: 'WEEKLY', startDate: day('2026-10-05'), dayOfWeek: 1, createdByUserId: actorId }
    });

    const response = await preview(csvFile([
      [employees[0].code, 'MORNING', '2026-10-12', 'false', ''],
      [employees[0].code, 'EVENING', '2026-10-12', 'false', ''],
      [employees[0].code, 'EVENING', '2026-10-12', 'false', '']
    ]));

    expect(response.status).toBe(200);
    expect(response.body.data.canCommit).toBe(false);
    expect(response.body.data.validRows).toHaveLength(1);
    expect(response.body.data.errorRows).toHaveLength(2);
    expect(response.body.data.errorRows[0]).toMatchObject({ rowNumber: 2 });
    expect(response.body.data.errorRows[1]).toMatchObject({ rowNumber: 4 });
    expect(await prismaTest.employeeScheduleRule.count()).toBe(1);
  });

  it('revalidates all imported rows and commits valid batches with transactional audit', async () => {
    const invalidRows = [
      { employeeCode: employees[0].code, shiftCode: 'MORNING', workDate: '2026-10-05', repeatWeekly: false, endDate: null, rowNumber: 2 },
      { employeeCode: 'NV-MISSING', shiftCode: 'EVENING', workDate: '2026-10-05', repeatWeekly: false, endDate: null, rowNumber: 3 }
    ];
    const rejected = await commit(invalidRows);

    expect(rejected.status).toBe(404);
    expect(rejected.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    expect(await prismaTest.employeeScheduleRule.count()).toBe(0);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_SCHEDULE_CREATED' } })).toBe(0);

    const overlappingShift = await prismaTest.workShift.create({ data: { code: 'MID_MORNING', name: 'Ca giữa sáng', startMinute: 600, endMinute: 750 } });
    const overlap = await commit([
      { employeeCode: employees[0].code, shiftCode: 'MORNING', workDate: '2026-10-05', repeatWeekly: false, endDate: null, rowNumber: 2 },
      { employeeCode: employees[0].code, shiftCode: overlappingShift.code, workDate: '2026-10-05', repeatWeekly: false, endDate: null, rowNumber: 3 }
    ]);
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('SCHEDULE_OVERLAP');
    expect(overlap.body.error.details.rowNumber).toBe('3');
    expect(await prismaTest.employeeScheduleRule.count()).toBe(0);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_SCHEDULE_CREATED' } })).toBe(0);

    const accepted = await commit([
      { employeeCode: employees[0].code, shiftCode: 'MORNING', workDate: '2026-10-05', repeatWeekly: false, endDate: null, rowNumber: 2 },
      { employeeCode: employees[0].code, shiftCode: 'EVENING', workDate: '2026-10-05', repeatWeekly: false, endDate: null, rowNumber: 3 }
    ]);

    expect(accepted.status).toBe(201);
    expect(accepted.body.data.createdCount).toBe(2);
    expect(await prismaTest.employeeScheduleRule.count()).toBe(2);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_SCHEDULE_CREATED', actorId } })).toBe(2);
  });

  it('exports only approved weekly occurrence columns in CSV and XLSX', async () => {
    await prismaTest.employeeScheduleRule.create({
      data: { employeeId: employees[0].id, shiftId: shifts[0].id, recurrenceType: 'WEEKLY', startDate: day('2026-09-07'), dayOfWeek: 1, createdByUserId: actorId }
    });
    await prismaTest.employeeScheduleRule.create({
      data: { employeeId: employees[0].id, shiftId: shifts[2].id, recurrenceType: 'ONCE', startDate: day('2026-10-04'), createdByUserId: actorId }
    });
    await prismaTest.employeeScheduleException.create({
      data: { scheduleRuleId: (await prismaTest.employeeScheduleRule.findFirstOrThrow({ where: { recurrenceType: 'WEEKLY' } })).id, workDate: day('2026-09-28'), createdByUserId: actorId }
    });

    const csv = await request(app).get('/api/employee-schedules/export?weekStart=2026-09-28&format=csv').set(auth()).buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    const xlsx = await request(app).get('/api/employee-schedules/export?weekStart=2026-09-28&format=xlsx').set(auth()).buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const csvLines = (csv.body as Buffer).toString('utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    expect(csvLines[0]).toBe('employeeCode,employeeName,shiftCode,shiftName,workDate,startTime,endTime,repeatWeekly');
    expect(csvLines).toHaveLength(2);
    expect(csvLines[1]).toContain('2026-10-04');
    expect(csvLines.join('\n')).not.toContain('123456789012');
    expect(xlsx.status).toBe(200);
    const workbook = XLSX.read(xlsx.body, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as unknown[][];
    expect(rows[0]).toEqual(['employeeCode', 'employeeName', 'shiftCode', 'shiftName', 'workDate', 'startTime', 'endTime', 'repeatWeekly']);
    expect(rows[1]).toContain('2026-10-04');
    expect(JSON.stringify(rows)).not.toContain('079123456789');
    expect(JSON.stringify(rows)).not.toContain('123456789012');
  });
});
