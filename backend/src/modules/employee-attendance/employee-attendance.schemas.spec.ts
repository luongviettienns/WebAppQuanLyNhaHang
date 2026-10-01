import { describe, expect, it } from 'vitest';
import {
  parseAttendanceExceptionQuery,
  parseAdminAttendanceSessionUpdateInput,
  parseAttendanceWeekQuery,
  parseMarkAttendanceAbsentInput,
  parseCreateKioskSessionInput,
  parseDispositionRevokeInput,
  parseAttendanceSessionId,
  parseManualAttendanceSessionInput,
  parseKioskPunchInput
} from './employee-attendance.schemas';

describe('employee attendance request schemas', () => {
  it('accepts a valid kiosk punch with explicit action and idempotency key', () => {
    expect(parseKioskPunchInput({ attendanceCode: ' CC-100 ', action: 'CHECK_IN', idempotencyKey: 'punch-20260929-001' })).toEqual({
      attendanceCode: 'CC-100', action: 'CHECK_IN', idempotencyKey: 'punch-20260929-001'
    });
  });

  it.each(['clientTimestamp', 'branchId'])('rejects client-controlled %s on kiosk punch', (field) => {
    expect(() => parseKioskPunchInput({ attendanceCode: 'CC-100', action: 'CHECK_IN', idempotencyKey: 'punch-key-001', [field]: field === 'branchId' ? 1 : '2026-09-29T08:00:00+07:00' })).toThrowError();
  });

  it('requires a rule ID and valid schedule date together for a selected shift', () => {
    expect(() => parseKioskPunchInput({
      attendanceCode: 'CC-100', action: 'CHECK_IN', idempotencyKey: 'punch-key-001', scheduleRuleId: 5
    })).toThrowError();
    expect(() => parseKioskPunchInput({
      attendanceCode: 'CC-100', action: 'CHECK_IN', idempotencyKey: 'punch-key-001', scheduleRuleId: 5, scheduleDate: '2026-02-30'
    })).toThrowError();
    expect(parseKioskPunchInput({
      attendanceCode: 'CC-100', action: 'CHECK_IN', idempotencyKey: 'punch-key-001', scheduleRuleId: 5, scheduleDate: '2026-09-29'
    }).scheduleRuleId).toBe(5);
  });

  it('does not accept conflicting schedule and outside-schedule selections', () => {
    expect(() => parseKioskPunchInput({
      attendanceCode: 'CC-100', action: 'CHECK_IN', idempotencyKey: 'punch-key-001',
      scheduleRuleId: 5, scheduleDate: '2026-09-29', outsideScheduleConfirmation: true
    })).toThrowError();
  });

  it('does not allow checkout to select or relink a schedule', () => {
    expect(() => parseKioskPunchInput({
      attendanceCode: 'CC-100', action: 'CHECK_OUT', idempotencyKey: 'punch-key-001',
      scheduleRuleId: 5, scheduleDate: '2026-09-29'
    })).toThrowError();
    expect(() => parseKioskPunchInput({
      attendanceCode: 'CC-100', action: 'CHECK_OUT', idempotencyKey: 'punch-key-001',
      outsideScheduleConfirmation: true
    })).toThrowError();
  });

  it('rejects malformed dates, non-Monday week starts, and non-positive numeric IDs', () => {
    expect(() => parseAttendanceWeekQuery({ weekStart: '2026-02-30', branchId: 1 })).toThrowError();
    expect(() => parseAttendanceWeekQuery({ weekStart: '2026-09-29', branchId: 1 })).toThrowError();
    expect(() => parseAttendanceWeekQuery({ weekStart: '2026-09-28', branchId: 0 })).toThrowError();
    expect(parseAttendanceWeekQuery({ weekStart: '2026-09-28', branchId: '1' })).toMatchObject({
      branchId: 1, view: 'shift', page: 1, pageSize: 100
    });
  });

  it('validates the exception queue week, branch and open/resolved state', () => {
    expect(parseAttendanceExceptionQuery({ weekStart: '2026-09-28', branchId: '1' })).toMatchObject({
      branchId: 1, status: 'OPEN', page: 1, pageSize: 100
    });
    expect(parseAttendanceExceptionQuery({ weekStart: '2026-09-28', branchId: 1, status: 'RESOLVED' }).status).toBe('RESOLVED');
    expect(() => parseAttendanceExceptionQuery({ weekStart: '2026-09-27', branchId: 1 })).toThrowError();
    expect(() => parseAttendanceExceptionQuery({ weekStart: '2026-09-28', branchId: 1, status: 'ANY' })).toThrowError();
  });

  it('requires a meaningful reason and valid actual timestamps for Admin manual entry', () => {
    expect(() => parseManualAttendanceSessionInput({
      employeeId: 0, branchId: 1, checkInAt: '2026-09-29T08:00:00+07:00', reason: 'Thiếu giờ'
    })).toThrowError();
    expect(() => parseManualAttendanceSessionInput({
      employeeId: 1, branchId: 1, checkInAt: 'not-a-date', reason: 'Bổ sung chấm công'
    })).toThrowError();
    expect(() => parseManualAttendanceSessionInput({
      employeeId: 1, branchId: 1, checkInAt: '2026-09-29T08:00:00+07:00', reason: '  '
    })).toThrowError();
    expect(parseCreateKioskSessionInput({ branchId: 1, expiresInMinutes: 480 }).expiresInMinutes).toBe(480);
  });

  it('requires a reason and complete occurrence pair when Admin corrects attendance', () => {
    expect(parseAdminAttendanceSessionUpdateInput({
      checkInAt: '2026-09-29T08:05:00+07:00', reason: 'Sửa giờ vào'
    })).toMatchObject({ reason: 'Sửa giờ vào' });
    expect(parseAdminAttendanceSessionUpdateInput({
      attendancePolicyVersionId: 12, reason: 'Áp dụng đúng chính sách tại ngày chấm công'
    })).toMatchObject({ attendancePolicyVersionId: 12 });
    expect(() => parseAdminAttendanceSessionUpdateInput({ checkOutAt: null, reason: 'Xóa giờ ra' })).toThrowError();
    expect(() => parseAdminAttendanceSessionUpdateInput({ scheduleRuleId: 11, reason: 'Đổi liên kết' })).toThrowError();
    expect(() => parseAdminAttendanceSessionUpdateInput({ checkInAt: '2026-09-29T08:00:00+07:00' })).toThrowError();
  });

  it('validates reasoned absence and revocation actions', () => {
    expect(parseMarkAttendanceAbsentInput({ branchId: 1, reason: 'Đã xác minh với quản lý' }).branchId).toBe(1);
    expect(() => parseMarkAttendanceAbsentInput({ branchId: 1, reason: 'ok' })).toThrowError();
    expect(parseDispositionRevokeInput({ reason: 'Có dữ liệu chấm công thực tế' }).reason).toBe('Có dữ liệu chấm công thực tế');
    expect(() => parseAttendanceSessionId('0')).toThrowError();
  });
});
