import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
const migrationsPath = path.resolve(process.cwd(), 'prisma/migrations');
const schema = fs.readFileSync(schemaPath, 'utf8');

function modelBody(name: string): string {
  const match = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema);
  return match?.[1] ?? '';
}

describe('employee attendance persistence contract', () => {
  it('uses a real default MAIN branch and makes schedule rules branch-aware', () => {
    const branch = modelBody('Branch');
    expect(branch).toMatch(/code\s+String\s+@unique/);
    expect(branch).toMatch(/isActive\s+Boolean/);
    expect(branch).toMatch(/isDefault\s+Boolean/);

    const scheduleRule = modelBody('EmployeeScheduleRule');
    expect(scheduleRule).toMatch(/branchId\s+Int\b/);
    expect(scheduleRule).toMatch(/branch\s+Branch\s+@relation/);
    expect(scheduleRule).toMatch(/@@unique\(\[branchId, employeeId, shiftId, recurrenceType, startDate, dayOfWeek\]/);
    expect(schema).toMatch(/model EmployeeScheduleRule[\s\S]*?@@index\(\[branchId, employeeId, startDate\]/);
  });

  it('keeps actual attendance, planned snapshots, idempotency, dispositions and hashed rate buckets separate', () => {
    const attendance = modelBody('EmployeeAttendanceSession');
    expect(attendance).toMatch(/checkInAt\s+DateTime/);
    expect(attendance).toMatch(/checkOutAt\s+DateTime\?/);
    expect(attendance).toMatch(/scheduleRuleId\s+Int\?/);
    expect(attendance).toMatch(/scheduleDate\s+DateTime\?/);
    expect(attendance).toMatch(/plannedShiftName\s+String\?/);
    expect(attendance).toMatch(/plannedStartMinute\s+Int\?/);
    expect(attendance).toMatch(/plannedEndMinute\s+Int\?/);
    expect(attendance).toMatch(/checkInSource\s+AttendancePunchSource/);

    expect(modelBody('AttendanceKioskIdempotency')).toMatch(/@@unique\(\[kioskSessionId, idempotencyKey\]/);
    expect(modelBody('EmployeeAttendanceDisposition')).toMatch(/@@unique\(\[branchId, scheduleRuleId, workDate\]/);
    expect(modelBody('AttendanceKioskRateLimitBucket')).toMatch(/bucketHash\s+String\s+@unique/);
    expect(modelBody('AttendanceKioskRateLimitBucket')).toMatch(/expiresAt\s+DateTime/);
  });

  it('adds an additive migration that creates MAIN and backfills all existing schedule rules', () => {
    const migrationName = fs.readdirSync(migrationsPath).find(name => name.endsWith('_employee_attendance_foundation'));
    expect(migrationName).toBeDefined();
    const sql = fs.readFileSync(path.join(migrationsPath, migrationName!, 'migration.sql'), 'utf8');
    expect(sql).toMatch(/INSERT\s+INTO\s+`?Branch`?/i);
    expect(sql).toMatch(/'MAIN'/);
    expect(sql).toMatch(/UPDATE\s+`?EmployeeScheduleRule`?[\s\S]*?branchId/i);
    expect(sql).toMatch(/DROP\s+INDEX\s+`?EmployeeScheduleRule_duplicate_key`?/i);
    expect(sql).toMatch(/ADD\s+UNIQUE\s+INDEX\s+`?EmployeeScheduleRule_duplicate_key`?\s*\(`branchId`/i);
    expect(sql).not.toMatch(/\b(DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i);
    expect(sql).not.toMatch(/ON\s+DELETE\s+CASCADE/i);
  });
});
