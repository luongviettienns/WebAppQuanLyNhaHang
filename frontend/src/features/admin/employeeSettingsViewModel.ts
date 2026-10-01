import type { EmployeeSettingsCapabilities, EmployeeSettingsWorkspaceDto } from '../../api/employeeSettings';

const checklistPresentation: Record<string, { title: string; empty: string; unit: string }> = {
  employees: { title: 'Thêm nhân viên', empty: 'Chưa có nhân viên', unit: 'nhân viên' },
  'attendance-policy': { title: 'Thiết lập chế độ chấm công', empty: 'Chưa có ca làm việc', unit: 'ca làm việc' },
  'attendance-method': { title: 'Hình thức chấm công', empty: 'Chưa có kiosk hoạt động', unit: 'kiosk' },
  compensation: { title: 'Thiết lập lương', empty: 'Chưa đủ thiết lập lương', unit: 'nhân viên' },
  payroll: { title: 'Thiết lập bảng lương', empty: 'Chưa có bảng lương', unit: 'bảng lương' }
};

export function formatEmployeeSettingsDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function formatEmployeeSettingsMinutes(value: number) {
  const safe = Math.max(0, Math.floor(value));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (!hours) return `${minutes} phút`;
  return minutes ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

function dateOnly(value: string) { return new Date(`${value}T00:00:00.000Z`); }
export function formatHolidayDuration(startDate: string, endDate: string) {
  const duration = Math.floor((dateOnly(endDate).getTime() - dateOnly(startDate).getTime()) / 86_400_000) + 1;
  return `${Math.max(1, duration)} ngày`;
}

function capabilityModels(capabilities: EmployeeSettingsCapabilities) {
  return Object.fromEntries(Object.entries(capabilities).map(([key, enabled]) => [
    key,
    { enabled, label: enabled ? 'Đã hỗ trợ' : 'Chưa hỗ trợ trong MVP' }
  ])) as Record<keyof EmployeeSettingsCapabilities, { enabled: boolean; label: string }>;
}

export function buildEmployeeSettingsViewModel(workspace: EmployeeSettingsWorkspaceDto) {
  const total = Math.max(1, workspace.checklist.totalCount);
  return {
    branchLabel: workspace.branch.name,
    businessDateLabel: formatEmployeeSettingsDate(workspace.businessDate),
    progress: {
      label: `${workspace.checklist.completedCount}/${workspace.checklist.totalCount}`,
      percent: Math.round((workspace.checklist.completedCount / total) * 100)
    },
    checklist: workspace.checklist.steps.map(step => {
      const presentation = checklistPresentation[step.key] ?? { title: step.key, empty: 'Chưa hoàn thành', unit: 'mục' };
      const countLabel = step.count > 0
        ? `${step.count}/${step.total} ${presentation.unit}`.replace('/undefined', '')
        : presentation.empty;
      return { ...step, title: presentation.title, countLabel };
    }),
    capabilities: capabilityModels(workspace.capabilities),
    raw: workspace
  };
}
