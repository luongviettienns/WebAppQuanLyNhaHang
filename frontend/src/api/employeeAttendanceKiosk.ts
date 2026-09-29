import { getApiBaseUrl } from './config';
import type { ApiErrorResponse, ErrorCode } from './contracts';
import type { AttendanceLinkStatus } from './employeeAttendance';

export interface KioskPunchSelection {
  attendanceCode: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  scheduleRuleId?: number;
  scheduleDate?: string;
  outsideScheduleConfirmation?: boolean;
}

export type KioskPunchInput = KioskPunchSelection & { idempotencyKey: string };

export interface KioskPunchSuccessDto {
  action: 'CHECK_IN' | 'CHECK_OUT'; employeeName: string; recordedAt: string;
  state: 'OPEN' | 'COMPLETED'; linkStatus: AttendanceLinkStatus; shiftName: string | null;
}

export interface KioskPunchChoiceRequiredDto {
  selectionRequired: true;
  code: 'SCHEDULE_SELECTION_REQUIRED' | 'OUTSIDE_SCHEDULE_CONFIRMATION_REQUIRED';
  choices: Array<{ scheduleRuleId: number; scheduleDate: string; shiftName: string; plannedStartMinute: number; plannedEndMinute: number }>;
  allowOutsideSchedule: boolean;
}

export type KioskPunchResponseDto = KioskPunchSuccessDto | KioskPunchChoiceRequiredDto;

export class AttendanceKioskApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(message: string, code: ErrorCode, status: number) {
    super(message);
    this.name = 'AttendanceKioskApiError';
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const retryIdentity = new WeakMap<KioskPunchRetryState, { fingerprint: string | null; key: string | null }>();

function newIdempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `attendance-${random}`;
}

export class KioskPunchRetryState {
  constructor(private readonly makeKey: () => string = newIdempotencyKey) {
    retryIdentity.set(this, { fingerprint: null, key: null });
  }

  prepare(selection: KioskPunchSelection): KioskPunchInput {
    const fingerprint = JSON.stringify(selection);
    const current = retryIdentity.get(this)!;
    if (current.fingerprint !== fingerprint || current.key === null) {
      current.fingerprint = fingerprint;
      current.key = this.makeKey();
    }
    return { ...selection, idempotencyKey: current.key };
  }

  confirmSuccess(): void {
    this.discardPendingAttempt();
  }

  discardPendingAttempt(): void {
    retryIdentity.set(this, { fingerprint: null, key: null });
  }
}

function redact(value: string, secrets: string[]) {
  return secrets.filter(secret => secret.length > 0).reduce((safe, secret) => safe.split(secret).join('[đã ẩn]'), value);
}

export async function punchAttendanceKioskApi(credential: string, input: KioskPunchInput): Promise<KioskPunchResponseDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/attendance-kiosk/punch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-kiosk-credential': credential },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorResponse | null;
    const code = body?.error?.code || 'VALIDATION_ERROR';
    const fallback = code === 'ATTENDANCE_CREDENTIAL_INVALID'
      ? 'Mã chấm công không hợp lệ.'
      : 'Không thể ghi nhận chấm công. Vui lòng thử lại.';
    const safeMessage = redact(body?.error?.message || fallback, [credential, input.attendanceCode]);
    throw new AttendanceKioskApiError(safeMessage, code, response.status);
  }
  return (await response.json() as { data: KioskPunchResponseDto }).data;
}
