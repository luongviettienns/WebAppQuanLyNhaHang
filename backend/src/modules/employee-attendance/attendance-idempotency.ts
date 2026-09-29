import { createHash } from 'node:crypto';

export interface AttendancePunchDigestInput {
  employeeId: number;
  action: 'CHECK_IN' | 'CHECK_OUT';
  scheduleRuleId?: number;
  scheduleDate?: string;
  outsideScheduleConfirmation?: boolean;
}

export function createAttendancePunchDigest(input: AttendancePunchDigestInput): string {
  if (!Number.isSafeInteger(input.employeeId) || input.employeeId <= 0) throw new Error('A valid employee ID is required.');
  if ((input.scheduleRuleId === undefined) !== (input.scheduleDate === undefined)) {
    throw new Error('Schedule rule and date must be supplied together.');
  }
  if (input.action === 'CHECK_OUT' && (input.scheduleRuleId !== undefined || input.outsideScheduleConfirmation === true)) {
    throw new Error('Checkout idempotency cannot include a schedule selection.');
  }

  const canonical = JSON.stringify({
    employeeId: input.employeeId,
    action: input.action,
    scheduleRuleId: input.scheduleRuleId ?? null,
    scheduleDate: input.scheduleDate ?? null,
    outsideScheduleConfirmation: input.outsideScheduleConfirmation === true
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
