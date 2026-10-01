import type {
  EmployeePayrollDetailDto,
  EmployeePayrollLineDto,
  PayrollBatchStatus,
  PayrollPayBasis,
  PayrollWarningCode
} from '../../api/employeePayroll';

const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const statusLabels: Record<PayrollBatchStatus, string> = {
  DRAFT: 'Đang tạo', CALCULATED: 'Tạm tính', FINALIZED: 'Đã chốt lương', CANCELLED: 'Đã hủy'
};
const basisLabels: Record<PayrollPayBasis, string> = {
  MONTHLY: 'Hàng tháng', HOURLY: 'Theo giờ thực tế', PER_SHIFT: 'Theo ca thực tế'
};
const warningLabels: Record<PayrollWarningCode, string> = {
  COMPENSATION_MISSING: 'Thiếu thiết lập lương',
  MISSING_CHECK_OUT: 'Thiếu giờ ra',
  ATTENDANCE_NEEDS_REVIEW: 'Chấm công cần đối chiếu',
  INVALID_ATTENDANCE_DURATION: 'Thời lượng chấm công không hợp lệ',
  UNSCHEDULED_ATTENDANCE: 'Có chấm công ngoài lịch',
  CONFIRMED_ABSENCE: 'Có vắng mặt đã xác nhận'
};
const warningOrder: PayrollWarningCode[] = [
  'COMPENSATION_MISSING', 'MISSING_CHECK_OUT', 'ATTENDANCE_NEEDS_REVIEW',
  'INVALID_ATTENDANCE_DURATION', 'UNSCHEDULED_ATTENDANCE', 'CONFIRMED_ABSENCE'
];
const blockers = new Set<PayrollWarningCode>([
  'COMPENSATION_MISSING', 'MISSING_CHECK_OUT', 'ATTENDANCE_NEEDS_REVIEW', 'INVALID_ATTENDANCE_DURATION'
]);

export function previousCompletePayrollMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const previous = new Date(Date.UTC(Number(values.year), Number(values.month) - 2, 1));
  const year = previous.getUTCFullYear();
  const monthNumber = previous.getUTCMonth() + 1;
  const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { month, periodStart: `${month}-01`, periodEnd: `${month}-${String(days).padStart(2, '0')}` };
}

export const payrollStatusLabel = (status: PayrollBatchStatus) => statusLabels[status];
export const payrollBasisLabel = (basis: PayrollPayBasis) => basisLabels[basis];

export function formatPayrollVnd(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} ₫`;
}

export function formatPayrollHours(minutes: number) {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours === 0) return `${remainder} phút`;
  return remainder === 0 ? `${hours} giờ` : `${hours} giờ ${remainder} phút`;
}

export function groupPayrollWarnings(codes: PayrollWarningCode[]) {
  const unique = new Set(codes);
  const rows = warningOrder.filter(code => unique.has(code)).map(code => ({ code, label: warningLabels[code] }));
  return { blockers: rows.filter(item => blockers.has(item.code)), information: rows.filter(item => !blockers.has(item.code)) };
}

function signedMoney(value: number) {
  if (value === 0) return formatPayrollVnd(0);
  return `${value > 0 ? '+' : '−'}${formatPayrollVnd(Math.abs(value))}`;
}

function compensationBasis(line: EmployeePayrollLineDto) {
  const terms = Array.isArray(line.sourceSnapshot.compensationTerms)
    ? line.sourceSnapshot.compensationTerms as Array<{ payBasis?: PayrollPayBasis }>
    : [];
  const labels = [...new Set(terms.map(term => term.payBasis).filter((basis): basis is PayrollPayBasis => Boolean(basis)).map(payrollBasisLabel))];
  return labels.length ? labels.join(' / ') : 'Chưa có thiết lập lương';
}

function lineModel(line: EmployeePayrollLineDto) {
  return {
    id: line.id,
    employeeId: line.employeeId,
    employeeLabel: `${line.employeeName} · ${line.employeeCode}`,
    department: line.departmentName ?? 'Chưa xếp phòng ban',
    jobTitle: line.jobTitleName ?? 'Chưa xếp chức danh',
    basis: compensationBasis(line),
    actualTime: formatPayrollHours(line.actualMinutes),
    gross: formatPayrollVnd(line.grossAmount),
    adjustment: signedMoney(line.bonusAmount - line.deductionAmount),
    net: formatPayrollVnd(line.netAmount),
    paid: formatPayrollVnd(line.paidAmount),
    remaining: formatPayrollVnd(line.remainingAmount),
    warnings: groupPayrollWarnings(line.warningCodes),
    raw: line
  };
}

export function buildEmployeePayrollDetailModel(detail: EmployeePayrollDetailDto) {
  const adjustment = detail.totalAdjustmentAmount;
  const sourceState = detail.status === 'FINALIZED'
    ? { tone: 'frozen' as const, label: 'Dữ liệu đã khóa', action: 'Bảng lương giữ nguyên theo lần chốt' }
    : detail.sourceStale
      ? { tone: 'warning' as const, label: 'Nguồn dữ liệu đã thay đổi', action: 'Tính lại trước khi chốt lương' }
      : { tone: 'current' as const, label: 'Nguồn dữ liệu hiện hành', action: 'Có thể chốt khi không còn cảnh báo chặn' };
  return {
    id: detail.id,
    code: detail.code,
    name: detail.name,
    status: payrollStatusLabel(detail.status),
    sourceState,
    lines: detail.lines.map(lineModel),
    totals: {
      gross: formatPayrollVnd(detail.totalGrossAmount),
      adjustment: signedMoney(adjustment),
      net: formatPayrollVnd(detail.totalNetAmount),
      paid: formatPayrollVnd(detail.totalPaidAmount),
      remaining: formatPayrollVnd(detail.totalRemainingAmount)
    },
    raw: detail
  };
}
