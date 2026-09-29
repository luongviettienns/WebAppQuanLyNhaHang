import { describe, expect, it } from 'vitest';
import type { ScheduleOccurrenceDto, ScheduleWeekEmployeeDto } from '../../api/employeeScheduleManagement';
import {
  addWeeksToWeekStart,
  buildScheduleScreenState,
  buildWeekDays,
  formatCompensationProjection,
  formatScheduleVnd,
  formatShiftTime,
  getMondayWeekStart,
  toScheduleCellModel
} from './employeeScheduleViewModel';

const occurrence: ScheduleOccurrenceDto = {
  ruleId: 12, employeeId: 5, shiftId: 2, recurrenceType: 'WEEKLY', workDate: '2026-10-01',
  ruleStartDate: '2026-09-03', ruleEndDate: null, dayOfWeek: 4, shiftCode: 'MORNING', shiftName: 'Ca sáng', startMinute: 480, endMinute: 720
};
const employee = (overrides: Partial<ScheduleWeekEmployeeDto> = {}): ScheduleWeekEmployeeDto => ({
  id: 5, code: 'NV00005', name: 'Nguyễn An', status: 'WORKING', department: null, jobTitle: null, occurrences: [occurrence],
  compensation: { amount: 640000, status: 'ESTIMATED' }, ...overrides
});

describe('employee schedule view model', () => {
  it('calculates Monday weeks and navigates across month/year boundaries using date-only arithmetic', () => {
    expect(getMondayWeekStart('2026-09-29')).toBe('2026-09-28');
    expect(getMondayWeekStart('2027-01-01')).toBe('2026-12-28');
    expect(addWeeksToWeekStart('2026-12-28', 1)).toBe('2027-01-04');
    expect(addWeeksToWeekStart('2026-09-28', -1)).toBe('2026-09-21');
  });

  it('builds seven stable weekday labels and dates without shifting through local timezone parsing', () => {
    const days = buildWeekDays('2026-09-28', '2026-09-29');
    expect(days).toHaveLength(7);
    expect(days.map(day => day.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(days.map(day => day.label)).toEqual(['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật']);
    expect(days.filter(day => day.isToday).map(day => day.date)).toEqual(['2026-09-29']);
    expect(days.filter(day => day.isWeekend).map(day => day.date)).toEqual(['2026-10-03', '2026-10-04']);
  });

  it('renders recurrence, shift duration and compensation projection states without inventing monthly wages', () => {
    expect(formatShiftTime(480, 720)).toBe('08:00 - 12:00');
    expect(formatScheduleVnd(640000)).toBe('640.000 đ');
    expect(toScheduleCellModel(occurrence)).toMatchObject({ key: '12:2026-10-01', title: 'Ca sáng', time: '08:00 - 12:00', recurrenceLabel: 'Lặp hàng tuần' });
    expect(toScheduleCellModel({ ...occurrence, recurrenceType: 'ONCE' }).recurrenceLabel).toBe('Một lần');
    expect(formatCompensationProjection({ amount: 640000, status: 'ESTIMATED' })).toBe('640.000 đ');
    expect(formatCompensationProjection({ amount: null, status: 'MONTHLY_NOT_ESTIMATED' })).toBe('Lương tháng — chưa ước tính');
    expect(formatCompensationProjection({ amount: null, status: 'COMPENSATION_NOT_CONFIGURED' })).toBe('Chưa thiết lập lương');
  });

  it('distinguishes loading, error, empty, and ready schedule states', () => {
    expect(buildScheduleScreenState({ loading: true, employees: [] })).toEqual({ kind: 'loading' });
    expect(buildScheduleScreenState({ loading: false, error: 'Mất kết nối', employees: [] })).toEqual({ kind: 'error', message: 'Mất kết nối' });
    expect(buildScheduleScreenState({ loading: false, employees: [] })).toEqual({ kind: 'empty' });
    expect(buildScheduleScreenState({ loading: false, employees: [employee()] })).toMatchObject({ kind: 'ready', employees: [employee()] });
  });
});
