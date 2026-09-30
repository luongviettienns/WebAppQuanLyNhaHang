import { describe, expect, it } from 'vitest';
import {
  buildEmployeeSettingsViewModel,
  formatEmployeeSettingsDate,
  formatEmployeeSettingsMinutes,
  formatHolidayDuration
} from './employeeSettingsViewModel';

describe('employee settings view model', () => {
  it('formats date-only, minute and holiday duration values in Vietnamese', () => {
    expect(formatEmployeeSettingsDate('2026-10-01')).toBe('01/10/2026');
    expect(formatEmployeeSettingsMinutes(480)).toBe('8 giờ');
    expect(formatEmployeeSettingsMinutes(90)).toBe('1 giờ 30 phút');
    expect(formatHolidayDuration('2027-02-06', '2027-02-10')).toBe('5 ngày');
  });

  it('maps truthful checklist progress and locks unsupported capabilities', () => {
    const model = buildEmployeeSettingsViewModel({
      branch: { id: 1, code: 'MAIN', name: 'Chi nhánh trung tâm' }, businessDate: '2026-09-30',
      revisions: { attendance: 2, payroll: 1, workweek: 1, holiday: 0 },
      effectivePolicies: { attendance: null, payroll: null, workweek: null },
      history: { attendance: [], payroll: [], workweek: [] }, holidays: [],
      checklist: { completedCount: 4, totalCount: 5, steps: [
        { key: 'employees', destination: 'employee-directory', completed: true, count: 3 },
        { key: 'payroll', destination: 'employee-payroll', completed: false, count: 0 }
      ] },
      capabilities: {
        mobileAttendance: false, automaticAttendance: false, continuousShiftPunch: false, hourToDayConversion: false,
        automaticOvertime: false, scheduledHoursPayroll: false, automaticPayrollCreation: false,
        automaticPayrollRefresh: false, salaryTemplates: false, tax: false, insurance: false,
        hardwareTimeclock: false, zaloMiniApp: false
      }
    });

    expect(model.progress).toEqual({ label: '4/5', percent: 80 });
    expect(model.checklist).toEqual([
      expect.objectContaining({ key: 'employees', title: 'Thêm nhân viên', countLabel: '3 nhân viên', completed: true }),
      expect.objectContaining({ key: 'payroll', title: 'Thiết lập bảng lương', countLabel: 'Chưa có bảng lương', completed: false })
    ]);
    expect(model.capabilities.automaticAttendance).toEqual({ enabled: false, label: 'Chưa hỗ trợ trong MVP' });
  });
});
