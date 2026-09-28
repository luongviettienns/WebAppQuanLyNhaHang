import { randomBytes } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import {
  DepartmentCreateInput,
  DepartmentUpdateInput,
  EmployeeCompensationInput,
  EmployeeCreateInput,
  EmployeeListQuery,
  EmployeeStatusInput,
  EmployeeUpdateInput,
  JobTitleCreateInput,
  JobTitleUpdateInput,
  LinkableUsersQuery
} from './employees.schemas';
import { EmployeeDetail, EmployeeListItem, EmployeeListResult } from './employees.types';

const detailInclude: Prisma.EmployeeInclude = {
  department: { select: { id: true, name: true, isActive: true } },
  jobTitle: { select: { id: true, name: true, isActive: true } },
  user: { select: { id: true, username: true, name: true, role: true } },
  compensations: { orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }] }
};

const listSelect: Prisma.EmployeeSelect = {
  id: true,
  code: true,
  attendanceCode: true,
  name: true,
  phone: true,
  status: true,
  nationalId: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, isActive: true } },
  jobTitle: { select: { id: true, name: true, isActive: true } }
};

const normalizePhone = (value: string) => value.replace(/\D/g, '');
const normalizeEmpty = (value: string | null | undefined) => value === '' || value === undefined ? null : value;
const toDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : null;
const maskNationalId = (value: string | null) => value ? `${'•'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}` : null;

const toListItem = (employee: Prisma.EmployeeGetPayload<{ select: typeof listSelect }>): EmployeeListItem => ({
  ...employee,
  nationalId: maskNationalId(employee.nationalId),
  debtAdvance: null,
  createdAt: employee.createdAt.toISOString(),
  updatedAt: employee.updatedAt.toISOString()
});

const toEmployeeData = (input: EmployeeCreateInput | EmployeeUpdateInput): Prisma.EmployeeUncheckedUpdateInput => {
  const data: Record<string, unknown> = {};
  const optionalTextFields = [
    'avatarUrl', 'note', 'nationalId', 'address', 'province', 'ward', 'facebook', 'bankName', 'bankAccountNumber', 'bankAccountName'
  ] as const;
  for (const field of optionalTextFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) data[field] = normalizeEmpty(input[field]);
  }
  for (const field of ['name', 'gender', 'departmentId', 'jobTitleId', 'userId'] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) data[field] = input[field];
  }
  if (Object.prototype.hasOwnProperty.call(input, 'phone') && input.phone !== undefined) data.phone = normalizePhone(input.phone);
  if (Object.prototype.hasOwnProperty.call(input, 'email')) data.email = normalizeEmpty(input.email);
  if (Object.prototype.hasOwnProperty.call(input, 'startDate')) data.startDate = toDate(input.startDate);
  if (Object.prototype.hasOwnProperty.call(input, 'birthDate')) data.birthDate = toDate(input.birthDate);
  return data as Prisma.EmployeeUncheckedUpdateInput;
};

const assertReferencesActive = async (
  tx: Prisma.TransactionClient,
  input: { departmentId?: number | null; jobTitleId?: number | null },
  current?: { departmentId: number | null; jobTitleId: number | null }
) => {
  if (input.departmentId != null && input.departmentId !== current?.departmentId && !await tx.department.findFirst({ where: { id: input.departmentId, isActive: true }, select: { id: true } })) {
    throw ApiError.badRequest('Phòng ban không tồn tại hoặc đã ngừng hoạt động');
  }
  if (input.jobTitleId != null && input.jobTitleId !== current?.jobTitleId && !await tx.jobTitle.findFirst({ where: { id: input.jobTitleId, isActive: true }, select: { id: true } })) {
    throw ApiError.badRequest('Chức danh không tồn tại hoặc đã ngừng hoạt động');
  }
};

const assertUserLinkAvailable = async (tx: Prisma.TransactionClient, userId: number | null | undefined, employeeId?: number) => {
  if (userId == null) return;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw ApiError.badRequest('Tài khoản liên kết không tồn tại');
  const linked = await tx.employee.findFirst({ where: { userId, ...(employeeId ? { id: { not: employeeId } } : {}) }, select: { id: true } });
  if (linked) throw ApiError.conflict('Tài khoản này đã liên kết với hồ sơ nhân viên khác');
};

const getDetail = async (client: PrismaClient | Prisma.TransactionClient, id: number) => {
  const employee = await client.employee.findUnique({ where: { id }, include: detailInclude });
  if (!employee) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên');
  return {
    ...employee,
    startDate: employee.startDate?.toISOString() ?? null,
    endDate: employee.endDate?.toISOString() ?? null,
    birthDate: employee.birthDate?.toISOString() ?? null,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
    compensations: employee.compensations.map(compensation => ({
      ...compensation,
      effectiveFrom: compensation.effectiveFrom.toISOString(),
      createdAt: compensation.createdAt.toISOString()
    }))
  } satisfies EmployeeDetail;
};

const emitChanged = (ids: number[]) => emitToAll('employees:changed', { ids, updatedAt: new Date().toISOString() });

const throwMutationError = (error: unknown, conflictMessage = 'Dữ liệu nhân viên bị trùng') => {
  if (error instanceof ApiError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw ApiError.conflict(conflictMessage);
    if (error.code === 'P2003') throw ApiError.badRequest('Phòng ban, chức danh hoặc tài khoản liên kết không hợp lệ');
    if (error.code === 'P2025') throw ApiError.notFound('Không tìm thấy hồ sơ cần cập nhật');
  }
  throw error;
};

const newTemporaryCode = () => `TMP${randomBytes(10).toString('hex')}`;
const todayInBusinessTimezone = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00.000Z`);
};

export class EmployeesService {
  static async list(query: EmployeeListQuery): Promise<EmployeeListResult> {
    const search = query.search?.trim();
    const phoneSearch = search ? normalizePhone(search) : '';
    const where: Prisma.EmployeeWhereInput = {
      ...(search ? { OR: [
        { code: { contains: search } },
        { attendanceCode: { contains: search } },
        { name: { contains: search } },
        ...(phoneSearch ? [{ phone: { contains: phoneSearch } }] : [])
      ] } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.jobTitleId ? { jobTitleId: query.jobTitleId } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [rows, totalRows, workingCount, resignedCount] = await Promise.all([
      prisma.employee.findMany({ where, select: listSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take: query.pageSize }),
      prisma.employee.count({ where }),
      prisma.employee.count({ where: { status: 'WORKING' } }),
      prisma.employee.count({ where: { status: 'RESIGNED' } })
    ]);
    return {
      items: rows.map(toListItem),
      pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.ceil(totalRows / query.pageSize) },
      summary: { totalCount: workingCount + resignedCount, workingCount, resignedCount }
    };
  }

  static get(id: number) {
    return getDetail(prisma, id);
  }

  static async create(input: EmployeeCreateInput, actorId: number, actorName: string) {
    try {
      const created = await prisma.$transaction(async tx => {
        await assertReferencesActive(tx, input);
        await assertUserLinkAvailable(tx, input.userId);
        const employee = await tx.employee.create({ data: {
          ...toEmployeeData(input),
          code: newTemporaryCode(),
          attendanceCode: newTemporaryCode(),
          name: input.name,
          phone: normalizePhone(input.phone),
          status: 'WORKING'
        } as Prisma.EmployeeUncheckedCreateInput });
        const saved = await tx.employee.update({
          where: { id: employee.id },
          data: { code: `NV${String(employee.id).padStart(6, '0')}`, attendanceCode: `CC${String(employee.id).padStart(6, '0')}` }
        });
        if (input.initialCompensation) {
          const compensation = await this.createCompensationInTransaction(tx, employee.id, input.initialCompensation, actorId);
          await AuditService.logInTransaction(tx, {
            action: 'EMPLOYEE_COMPENSATION_CREATED', targetType: 'EmployeeCompensation', targetId: compensation.id, actorId, actorName,
            metadata: { employeeId: employee.id, changedFields: ['payBasis', 'baseRate', 'effectiveFrom', 'note'] }
          });
        }
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_CREATED', targetType: 'Employee', targetId: employee.id, actorId, actorName,
          metadata: { code: saved.code, changedFields: Object.keys(input).filter(field => field !== 'initialCompensation') }
        });
        return employee.id;
      });
      const result = await this.get(created);
      emitChanged([created]);
      return result;
    } catch (error) {
      throwMutationError(error, 'Mã định danh hoặc tài khoản liên kết đã được sử dụng');
    }
  }

  static async update(id: number, input: EmployeeUpdateInput, actorId: number, actorName: string) {
    try {
      await prisma.$transaction(async tx => {
        const current = await tx.employee.findUnique({ where: { id }, select: { id: true, departmentId: true, jobTitleId: true } });
        if (!current) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên');
        await assertReferencesActive(tx, input, current);
        await assertUserLinkAvailable(tx, input.userId, id);
        await tx.employee.update({ where: { id }, data: toEmployeeData(input) });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_UPDATED', targetType: 'Employee', targetId: id, actorId, actorName,
          metadata: { changedFields: Object.keys(input) }
        });
      });
      const result = await this.get(id);
      emitChanged([id]);
      return result;
    } catch (error) {
      throwMutationError(error, 'Mã định danh hoặc tài khoản liên kết đã được sử dụng');
    }
  }

  static async updateStatus(id: number, input: EmployeeStatusInput, actorId: number, actorName: string) {
    try {
      await prisma.$transaction(async tx => {
        const current = await tx.employee.findUnique({ where: { id }, select: { id: true, status: true, startDate: true, endDate: true } });
        if (!current) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên');
        const endDate = input.status === 'RESIGNED' ? (input.endDate ? toDate(input.endDate) : current.endDate ?? todayInBusinessTimezone()) : null;
        if (endDate && current.startDate && endDate < current.startDate) throw ApiError.badRequest('Ngày nghỉ việc không được trước ngày bắt đầu làm việc');
        await tx.employee.update({ where: { id }, data: { status: input.status, endDate } });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_STATUS_CHANGED', targetType: 'Employee', targetId: id, actorId, actorName,
          metadata: { status: input.status, changedFields: ['status', 'endDate'] }
        });
      });
      const result = await this.get(id);
      emitChanged([id]);
      return result;
    } catch (error) {
      throwMutationError(error);
    }
  }

  static async appendCompensation(id: number, input: EmployeeCompensationInput, actorId: number, actorName: string) {
    try {
      const created = await prisma.$transaction(async tx => {
        if (!await tx.employee.findUnique({ where: { id }, select: { id: true } })) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên');
        const compensation = await this.createCompensationInTransaction(tx, id, input, actorId);
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_COMPENSATION_CREATED', targetType: 'EmployeeCompensation', targetId: compensation.id, actorId, actorName,
          metadata: { employeeId: id, changedFields: ['payBasis', 'baseRate', 'effectiveFrom', 'note'] }
        });
        return compensation.id;
      });
      emitChanged([id]);
      return { id: created, employeeId: id, ...input, effectiveFrom: `${input.effectiveFrom}T00:00:00.000Z` };
    } catch (error) {
      throwMutationError(error, 'Đã có thiết lập lương cho ngày hiệu lực này');
    }
  }

  static async departments() {
    return prisma.department.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  static async createDepartment(input: DepartmentCreateInput, actorId: number, actorName: string) {
    try {
      const created = await prisma.$transaction(async tx => {
        const department = await tx.department.create({ data: { name: input.name, isActive: input.isActive ?? true } });
        await AuditService.logInTransaction(tx, { action: 'EMPLOYEE_DEPARTMENT_CREATED', targetType: 'Department', targetId: department.id, actorId, actorName, metadata: { name: department.name } });
        return department;
      });
      emitChanged([]);
      return created;
    } catch (error) { throwMutationError(error, 'Tên phòng ban đã tồn tại'); }
  }

  static async updateDepartment(id: number, input: DepartmentUpdateInput, actorId: number, actorName: string) {
    try {
      const updated = await prisma.$transaction(async tx => {
        const department = await tx.department.update({ where: { id }, data: input });
        await AuditService.logInTransaction(tx, { action: 'EMPLOYEE_DEPARTMENT_UPDATED', targetType: 'Department', targetId: id, actorId, actorName, metadata: { changedFields: Object.keys(input) } });
        return department;
      });
      emitChanged([]);
      return updated;
    } catch (error) { throwMutationError(error, 'Tên phòng ban đã tồn tại'); }
  }

  static async jobTitles() {
    return prisma.jobTitle.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  static async createJobTitle(input: JobTitleCreateInput, actorId: number, actorName: string) {
    try {
      const created = await prisma.$transaction(async tx => {
        const title = await tx.jobTitle.create({ data: { name: input.name, isActive: input.isActive ?? true } });
        await AuditService.logInTransaction(tx, { action: 'EMPLOYEE_JOB_TITLE_CREATED', targetType: 'JobTitle', targetId: title.id, actorId, actorName, metadata: { name: title.name } });
        return title;
      });
      emitChanged([]);
      return created;
    } catch (error) { throwMutationError(error, 'Tên chức danh đã tồn tại'); }
  }

  static async updateJobTitle(id: number, input: JobTitleUpdateInput, actorId: number, actorName: string) {
    try {
      const updated = await prisma.$transaction(async tx => {
        const title = await tx.jobTitle.update({ where: { id }, data: input });
        await AuditService.logInTransaction(tx, { action: 'EMPLOYEE_JOB_TITLE_UPDATED', targetType: 'JobTitle', targetId: id, actorId, actorName, metadata: { changedFields: Object.keys(input) } });
        return title;
      });
      emitChanged([]);
      return updated;
    } catch (error) { throwMutationError(error, 'Tên chức danh đã tồn tại'); }
  }

  static async linkableUsers(query: LinkableUsersQuery) {
    return prisma.user.findMany({
      where: {
        employeeProfile: { is: null },
        ...(query.search ? { OR: [{ username: { contains: query.search } }, { name: { contains: query.search } }] } : {})
      },
      select: { id: true, username: true, name: true, role: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 30
    });
  }

  private static async createCompensationInTransaction(tx: Prisma.TransactionClient, employeeId: number, input: EmployeeCompensationInput, actorId: number) {
    return tx.employeeCompensation.create({ data: {
      employeeId,
      payBasis: input.payBasis,
      baseRate: input.baseRate,
      effectiveFrom: toDate(input.effectiveFrom) as Date,
      note: input.note ?? null,
      createdByUserId: actorId
    } });
  }
}
