import { EmployeeGender, EmployeePayBasis, EmployeeStatus, Role } from '@prisma/client';

export interface EmployeeListItem {
  id: number;
  code: string;
  attendanceCode: string;
  name: string;
  phone: string;
  status: EmployeeStatus;
  nationalId: string | null;
  note: string | null;
  department: { id: number; name: string; isActive: boolean } | null;
  jobTitle: { id: number; name: string; isActive: boolean } | null;
  debtAdvance: null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDetail extends Omit<EmployeeListItem, 'nationalId' | 'debtAdvance'> {
  nationalId: string | null;
  userId: number | null;
  avatarUrl: string | null;
  departmentId: number | null;
  jobTitleId: number | null;
  startDate: string | null;
  endDate: string | null;
  birthDate: string | null;
  gender: EmployeeGender | null;
  address: string | null;
  province: string | null;
  ward: string | null;
  email: string | null;
  facebook: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  user: { id: number; username: string; name: string; role: Role } | null;
  compensations: Array<{
    id: number;
    payBasis: EmployeePayBasis;
    baseRate: number;
    effectiveFrom: string;
    note: string | null;
    createdByUserId: number | null;
    createdAt: string;
  }>;
}

export interface EmployeeListResult {
  items: EmployeeListItem[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  summary: { totalCount: number; workingCount: number; resignedCount: number };
}
