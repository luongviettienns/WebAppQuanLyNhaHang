import { describe, expect, it } from 'vitest';
import { createAttendancePunchDigest } from './attendance-idempotency';

describe('attendance punch idempotency digest', () => {
  it('is stable for the resolved employee, action and final schedule choice', () => {
    const first = createAttendancePunchDigest({
      employeeId: 7, action: 'CHECK_IN', scheduleRuleId: 13, scheduleDate: '2026-09-29'
    });
    const retry = createAttendancePunchDigest({
      employeeId: 7, action: 'CHECK_IN', scheduleDate: '2026-09-29', scheduleRuleId: 13
    });

    expect(first).toBe(retry);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when action, employee or final choice changes and does not require the attendance code', () => {
    const base = { employeeId: 7, action: 'CHECK_IN' as const, scheduleRuleId: 13, scheduleDate: '2026-09-29' };
    const digest = createAttendancePunchDigest(base);

    expect(createAttendancePunchDigest({ employeeId: 7, action: 'CHECK_OUT' })).not.toBe(digest);
    expect(createAttendancePunchDigest({ ...base, employeeId: 8 })).not.toBe(digest);
    expect(createAttendancePunchDigest({ employeeId: 7, action: 'CHECK_IN', outsideScheduleConfirmation: true })).not.toBe(digest);
  });
});
