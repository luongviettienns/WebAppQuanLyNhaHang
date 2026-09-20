import { Prisma, Supplier } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { CreateSupplierDto, SupplierListQuery, UpdateSupplierDto } from './supplier.schemas';

const SUPPLIER_CODE_PREFIX = 'NCC';
const SUPPLIER_CODE_RETRY_LIMIT = 2;

export type SupplierDto = {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxCode: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toSupplierDto(supplier: Supplier): SupplierDto {
  return {
    id: supplier.id,
    code: supplier.code,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    taxCode: supplier.taxCode,
    note: supplier.note,
    isActive: supplier.isActive,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt
  };
}

function formatSupplierCode(sequence: number): string {
  return `${SUPPLIER_CODE_PREFIX}${sequence.toString().padStart(6, '0')}`;
}

async function generateNextSupplierCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ nextCodeNumber: bigint | number | string | null }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING(code, 4) AS UNSIGNED)), 0) + 1 AS nextCodeNumber
    FROM Supplier
    WHERE code REGEXP '^NCC[0-9]+$'
  `;
  const sequence = Number(rows[0]?.nextCodeNumber ?? 1);
  return formatSupplierCode(Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1);
}

function isDuplicateSupplierCode(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some(value => typeof value === 'string' && value.toLowerCase().includes('code'));
}

function isMissingSupplier(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

export class SupplierService {
  static async list(query: SupplierListQuery) {
    const where: Prisma.SupplierWhereInput = {
      ...(query.isActive === 'all' ? {} : { isActive: query.isActive === 'true' }),
      ...(query.search ? {
        OR: [
          { code: { contains: query.search } },
          { name: { contains: query.search } },
          { phone: { contains: query.search } },
          { taxCode: { contains: query.search } }
        ]
      } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [totalRows, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({ where, skip, take: query.pageSize, orderBy: [{ isActive: 'desc' }, { code: 'asc' }] })
    ]);
    return {
      items: suppliers.map(toSupplierDto),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalRows,
        totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize))
      }
    };
  }

  static async findSelectable(search?: string): Promise<SupplierDto[]> {
    const normalizedSearch = search?.trim();
    const suppliers = await prisma.supplier.findMany({
      where: {
        isActive: true,
        ...(normalizedSearch ? {
          OR: [
            { code: { contains: normalizedSearch } },
            { name: { contains: normalizedSearch } },
            { phone: { contains: normalizedSearch } }
          ]
        } : {})
      },
      take: 100,
      orderBy: [{ code: 'asc' }]
    });
    return suppliers.map(toSupplierDto);
  }

  static async create(input: CreateSupplierDto, actorId?: number, actorName?: string): Promise<SupplierDto> {
    let created: Supplier;
    if (input.code) {
      try {
        created = await prisma.supplier.create({ data: { ...input, code: input.code } });
      } catch (error) {
        if (isDuplicateSupplierCode(error)) throw ApiError.conflict('Mã nhà cung cấp đã tồn tại');
        throw error;
      }
    } else {
      let lastError: unknown;
      for (let attempt = 0; attempt < SUPPLIER_CODE_RETRY_LIMIT; attempt += 1) {
        try {
          created = await prisma.$transaction(async tx => {
            const code = await generateNextSupplierCode(tx);
            return tx.supplier.create({ data: { ...input, code } });
          });
          await AuditService.log({
            action: 'SUPPLIER_CREATED', targetType: 'Supplier', targetId: created.id, actorId, actorName,
            metadata: { code: created.code, name: created.name, isActive: created.isActive }
          });
          return toSupplierDto(created);
        } catch (error) {
          if (!isDuplicateSupplierCode(error)) throw error;
          lastError = error;
        }
      }
      if (lastError) throw ApiError.conflict('Không thể tạo mã nhà cung cấp tự động, vui lòng thử lại');
      throw ApiError.internal();
    }

    await AuditService.log({
      action: 'SUPPLIER_CREATED', targetType: 'Supplier', targetId: created.id, actorId, actorName,
      metadata: { code: created.code, name: created.name, isActive: created.isActive }
    });
    return toSupplierDto(created);
  }

  static async update(id: number, input: UpdateSupplierDto, actorId?: number, actorName?: string): Promise<SupplierDto> {
    try {
      const updated = await prisma.supplier.update({ where: { id }, data: input });
      await AuditService.log({
        action: 'SUPPLIER_UPDATED', targetType: 'Supplier', targetId: updated.id, actorId, actorName,
        metadata: { name: updated.name, isActive: updated.isActive, updatedFields: Object.keys(input) }
      });
      return toSupplierDto(updated);
    } catch (error) {
      if (isMissingSupplier(error)) throw ApiError.notFound('Nhà cung cấp không tồn tại');
      throw error;
    }
  }
}
