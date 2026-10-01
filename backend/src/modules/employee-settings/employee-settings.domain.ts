export type EmployeeSettingsDomainErrorCode =
  | 'EMPLOYEE_SETTINGS_EFFECTIVE_DATE_INVALID'
  | 'EMPLOYEE_SETTINGS_EFFECTIVE_DATE_IN_PAST'
  | 'EMPLOYEE_SETTINGS_VALUE_INVALID'
  | 'EMPLOYEE_SETTINGS_CAPABILITY_UNSUPPORTED'
  | 'EMPLOYEE_SETTINGS_WORKWEEK_EMPTY'
  | 'EMPLOYEE_HOLIDAY_DATE_INVALID';

export class EmployeeSettingsDomainError extends Error {
  constructor(public readonly code: EmployeeSettingsDomainErrorCode, message: string) {
    super(message);
    this.name = 'EmployeeSettingsDomainError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface AttendancePolicyValues {
  attendanceMode: 'SHIFT';
  standardDayMinutes: number;
  lateThresholdMinutes: number;
  earlyLeaveThresholdMinutes: number;
  allowUnscheduledAttendance: boolean;
}

export interface PayrollPolicyValues {
  frequency: 'MONTHLY';
  periodStartDay: 1;
  hourlyCalculationSource: 'ACTUAL_ATTENDANCE';
}

export interface WorkweekPolicyValues {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export interface HolidayPeriodValues {
  name: string;
  startDate: string;
  endDate: string;
  note?: string | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toISOString().slice(0, 10) === value;
}

function requireSettingsDate(value: string): void {
  if (!isValidDate(value)) {
    throw new EmployeeSettingsDomainError(
      'EMPLOYEE_SETTINGS_EFFECTIVE_DATE_INVALID',
      'Ngày hiệu lực phải theo định dạng YYYY-MM-DD và là ngày hợp lệ'
    );
  }
}

function requireHolidayDate(value: string): void {
  if (!isValidDate(value)) {
    throw new EmployeeSettingsDomainError(
      'EMPLOYEE_HOLIDAY_DATE_INVALID',
      'Ngày nghỉ/lễ phải theo định dạng YYYY-MM-DD và là ngày hợp lệ'
    );
  }
}

export function selectEffectiveVersion<T extends { effectiveFrom: string; revision: number }>(
  versions: T[],
  businessDate: string
): T {
  requireSettingsDate(businessDate);
  const selected = versions
    .filter(version => isValidDate(version.effectiveFrom) && version.effectiveFrom <= businessDate)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom) || right.revision - left.revision)[0];
  if (!selected) {
    throw new EmployeeSettingsDomainError(
      'EMPLOYEE_SETTINGS_VALUE_INVALID',
      'Không tìm thấy phiên bản chính sách có hiệu lực'
    );
  }
  return selected;
}

export function assertEffectiveDateAllowed(effectiveFrom: string, currentBusinessDate: string): void {
  requireSettingsDate(effectiveFrom);
  requireSettingsDate(currentBusinessDate);
  if (effectiveFrom < currentBusinessDate) {
    throw new EmployeeSettingsDomainError(
      'EMPLOYEE_SETTINGS_EFFECTIVE_DATE_IN_PAST',
      'Ngày hiệu lực không được trước ngày nghiệp vụ hiện tại'
    );
  }
}

function requireIntegerInRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new EmployeeSettingsDomainError(
      'EMPLOYEE_SETTINGS_VALUE_INVALID',
      `${label} phải là số nguyên từ ${minimum} đến ${maximum}`
    );
  }
}

export function validateAttendancePolicy(input: AttendancePolicyValues): AttendancePolicyValues {
  if (input.attendanceMode !== 'SHIFT') {
    throw new EmployeeSettingsDomainError(
      'EMPLOYEE_SETTINGS_CAPABILITY_UNSUPPORTED',
      'MVP chỉ hỗ trợ chấm công theo ca làm việc'
    );
  }
  requireIntegerInRange(input.standardDayMinutes, 60, 1440, 'Số phút ngày công chuẩn');
  requireIntegerInRange(input.lateThresholdMinutes, 0, 720, 'Ngưỡng đi muộn');
  requireIntegerInRange(input.earlyLeaveThresholdMinutes, 0, 720, 'Ngưỡng về sớm');
  if (typeof input.allowUnscheduledAttendance !== 'boolean') {
    throw new EmployeeSettingsDomainError('EMPLOYEE_SETTINGS_VALUE_INVALID', 'Quyền chấm ngoài lịch không hợp lệ');
  }
  return { ...input };
}

export function validatePayrollPolicy(input: PayrollPolicyValues): PayrollPolicyValues {
  if (input.frequency !== 'MONTHLY' || input.periodStartDay !== 1
    || input.hourlyCalculationSource !== 'ACTUAL_ATTENDANCE') {
    throw new EmployeeSettingsDomainError(
      'EMPLOYEE_SETTINGS_CAPABILITY_UNSUPPORTED',
      'MVP chỉ hỗ trợ kỳ lương tháng từ ngày 1 và lương giờ theo chấm công thực tế'
    );
  }
  return { ...input };
}

export function validateWorkweekPolicy(input: WorkweekPolicyValues): WorkweekPolicyValues {
  const values = Object.values(input);
  if (values.some(value => typeof value !== 'boolean')) {
    throw new EmployeeSettingsDomainError('EMPLOYEE_SETTINGS_VALUE_INVALID', 'Ngày làm việc phải là giá trị bật hoặc tắt');
  }
  if (!values.some(Boolean)) {
    throw new EmployeeSettingsDomainError('EMPLOYEE_SETTINGS_WORKWEEK_EMPTY', 'Phải có ít nhất một ngày làm việc');
  }
  return { ...input };
}

export function validateHolidayPeriod(input: HolidayPeriodValues): HolidayPeriodValues {
  requireHolidayDate(input.startDate);
  requireHolidayDate(input.endDate);
  if (input.endDate < input.startDate) {
    throw new EmployeeSettingsDomainError('EMPLOYEE_HOLIDAY_DATE_INVALID', 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu');
  }
  const name = input.name.trim();
  if (!name) {
    throw new EmployeeSettingsDomainError('EMPLOYEE_SETTINGS_VALUE_INVALID', 'Tên kỳ nghỉ/lễ không được để trống');
  }
  const note = input.note?.trim() || null;
  return { ...input, name, note };
}

export function dateRangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
): boolean {
  requireHolidayDate(leftStart);
  requireHolidayDate(leftEnd);
  requireHolidayDate(rightStart);
  requireHolidayDate(rightEnd);
  if (leftEnd < leftStart || rightEnd < rightStart) {
    throw new EmployeeSettingsDomainError('EMPLOYEE_HOLIDAY_DATE_INVALID', 'Khoảng ngày nghỉ/lễ không hợp lệ');
  }
  return leftStart <= rightEnd && rightStart <= leftEnd;
}
