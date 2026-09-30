import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
const migrationPath = path.resolve(
  process.cwd(),
  'prisma/migrations/20260930160000_employee_settings/migration.sql'
);
const schema = fs.readFileSync(schemaPath, 'utf8');

function modelBody(name: string): string {
  const match = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema);
  return match?.[1] ?? '';
}

describe('employee settings persistence contract', () => {
  it('defines typed attendance and payroll settings instead of untyped flags', () => {
    expect(schema).toMatch(/enum EmployeeAttendanceMode\s*\{\s*SHIFT\s*\}/);
    expect(schema).toMatch(/enum EmployeePayrollFrequency\s*\{\s*MONTHLY\s*\}/);
    expect(schema).toMatch(/enum EmployeePayrollHourlySource\s*\{\s*ACTUAL_ATTENDANCE\s*\}/);

    const attendance = modelBody('BranchAttendancePolicyVersion');
    expect(attendance).toMatch(/attendanceMode\s+EmployeeAttendanceMode\s+@default\(SHIFT\)/);
    expect(attendance).toMatch(/standardDayMinutes\s+Int\s+@default\(480\)/);
    expect(attendance).toMatch(/lateThresholdMinutes\s+Int\s+@default\(0\)/);
    expect(attendance).toMatch(/earlyLeaveThresholdMinutes\s+Int\s+@default\(0\)/);
    expect(attendance).toMatch(/allowUnscheduledAttendance\s+Boolean\s+@default\(true\)/);

    const payroll = modelBody('BranchPayrollPolicyVersion');
    expect(payroll).toMatch(/frequency\s+EmployeePayrollFrequency\s+@default\(MONTHLY\)/);
    expect(payroll).toMatch(/hourlyCalculationSource\s+EmployeePayrollHourlySource\s+@default\(ACTUAL_ATTENDANCE\)/);
  });

  it('keeps independent optimistic revisions and effective versions per settings area', () => {
    const revisions = modelBody('BranchEmployeeSettingsRevision');
    expect(revisions).toMatch(/attendanceRevision\s+Int\s+@default\(1\)/);
    expect(revisions).toMatch(/payrollRevision\s+Int\s+@default\(1\)/);
    expect(revisions).toMatch(/workweekRevision\s+Int\s+@default\(1\)/);
    expect(revisions).toMatch(/holidayRevision\s+Int\s+@default\(0\)/);

    for (const name of [
      'BranchAttendancePolicyVersion',
      'BranchPayrollPolicyVersion',
      'BranchWorkweekPolicyVersion'
    ]) {
      const body = modelBody(name);
      expect(body).toMatch(/branchId\s+Int\b/);
      expect(body).toMatch(/effectiveFrom\s+DateTime\s+@db\.Date/);
      expect(body).toMatch(/revision\s+Int\b/);
      expect(body).toMatch(/@@unique\(\[branchId, effectiveFrom\]/);
      expect(body).toMatch(/@@unique\(\[branchId, revision\]/);
      expect(body).toMatch(/branch\s+Branch\s+@relation\([^\n]*onDelete: Restrict/);
    }
  });

  it('stores editable holidays as auditable archiveable branch records', () => {
    const holiday = modelBody('BranchHolidayPeriod');
    expect(holiday).toMatch(/startDate\s+DateTime\s+@db\.Date/);
    expect(holiday).toMatch(/endDate\s+DateTime\s+@db\.Date/);
    expect(holiday).toMatch(/revision\s+Int\s+@default\(1\)/);
    expect(holiday).toMatch(/archivedAt\s+DateTime\?/);
    expect(holiday).toMatch(/archivedByUserId\s+Int\?/);
    expect(holiday).toMatch(/branch\s+Branch\s+@relation\([^\n]*onDelete: Restrict/);
    expect(holiday).toMatch(/@@index\(\[branchId, startDate, endDate, archivedAt\]/);
  });

  it('persists schedule request idempotency and immutable warning evidence', () => {
    const idempotency = modelBody('EmployeeScheduleIdempotency');
    expect(idempotency).toMatch(/requestDigest\s+String\s+@db\.Char\(64\)/);
    expect(idempotency).toMatch(/response\s+Json/);
    expect(idempotency).toMatch(/@@unique\(\[actorId, operation, idempotencyKey\],\s*map:\s*"EmployeeScheduleIdempotency_actor_operation_key"/);
    expect(modelBody('EmployeeScheduleRule')).toMatch(/calendarWarningSnapshot\s+Json\?/);
  });

  it('freezes the attendance policy inputs used by each actual session', () => {
    const attendance = modelBody('EmployeeAttendanceSession');
    expect(attendance).toMatch(/attendancePolicyVersionId\s+Int\?/);
    expect(attendance).toMatch(/standardDayMinutesSnapshot\s+Int\s+@default\(480\)/);
    expect(attendance).toMatch(/lateThresholdMinutesSnapshot\s+Int\s+@default\(0\)/);
    expect(attendance).toMatch(/earlyLeaveThresholdMinutesSnapshot\s+Int\s+@default\(0\)/);
    expect(attendance).toMatch(/allowUnscheduledAttendanceSnapshot\s+Boolean\s+@default\(true\)/);
    expect(attendance).toMatch(/attendancePolicyVersion\s+BranchAttendancePolicyVersion\?/);
  });

  it('ships one additive migration with a migration-only baseline for every existing branch', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

    expect(sql).toMatch(/CREATE TABLE `BranchAttendancePolicyVersion`/);
    expect(sql).toMatch(/CREATE TABLE `BranchPayrollPolicyVersion`/);
    expect(sql).toMatch(/CREATE TABLE `BranchWorkweekPolicyVersion`/);
    expect(sql).toMatch(/CREATE TABLE `BranchHolidayPeriod`/);
    expect(sql).toMatch(/CREATE TABLE `BranchEmployeeSettingsRevision`/);
    expect(sql).toMatch(/CREATE TABLE `EmployeeScheduleIdempotency`/);
    expect(sql).toMatch(/1970-01-01/);
    expect(sql).toMatch(/INSERT\s+INTO\s+`BranchAttendancePolicyVersion`[\s\S]*SELECT[\s\S]*FROM\s+`Branch`/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+`BranchPayrollPolicyVersion`[\s\S]*SELECT[\s\S]*FROM\s+`Branch`/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+`BranchWorkweekPolicyVersion`[\s\S]*SELECT[\s\S]*FROM\s+`Branch`/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+`BranchEmployeeSettingsRevision`[\s\S]*SELECT[\s\S]*FROM\s+`Branch`/i);
    expect(sql).not.toMatch(/\b(DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i);
    expect(sql).not.toMatch(/ON\s+DELETE\s+CASCADE/i);
  });
});
