import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { CreateVoucherInput, UpdateVoucherInput } from './vouchers.schemas';
import { Voucher } from '@prisma/client';

export interface VoucherCalculationResult {
  voucherId: number;
  code: string;
  title: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  discountAmount: number;
  taxableAmount: number;
  vatAmount: number;
  finalAmount: number;
}

export class VouchersService {
  static async listVouchers() {
    return prisma.voucher.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { orders: true }
        }
      }
    });
  }

  static async getActiveVouchers() {
    const now = new Date();
    const vouchers = await prisma.voucher.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now }
      },
      orderBy: { minOrderValue: 'asc' }
    });

    return vouchers.filter((v) => v.usedCount < v.usageLimit);
  }

  static async getVoucherById(id: number) {
    const voucher = await prisma.voucher.findUnique({
      where: { id }
    });
    if (!voucher) {
      throw new ApiError(404, 'VOUCHER_NOT_FOUND', `Không tìm thấy voucher ID ${id}`);
    }
    return voucher;
  }

  static async createVoucher(input: CreateVoucherInput, actorId?: number, actorName?: string) {
    const existing = await prisma.voucher.findUnique({
      where: { code: input.code }
    });
    if (existing) {
      throw new ApiError(409, 'VOUCHER_ALREADY_EXISTS', `Mã voucher "${input.code}" đã tồn tại trong hệ thống`);
    }

    const voucher = await prisma.voucher.create({
      data: {
        code: input.code,
        title: input.title,
        discountType: input.discountType,
        discountValue: input.discountValue,
        minOrderValue: input.minOrderValue,
        maxDiscount: input.maxDiscount,
        usageLimit: input.usageLimit,
        isActive: input.isActive ?? true,
        startDate: input.startDate,
        endDate: input.endDate
      }
    });

    await prisma.auditLog.create({
      data: {
        action: 'VOUCHER_CREATED',
        targetType: 'Voucher',
        targetId: voucher.id,
        actorId,
        actorName,
        metadata: {
          code: voucher.code,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue
        }
      }
    });

    return voucher;
  }

  static async updateVoucher(id: number, input: UpdateVoucherInput, actorId?: number, actorName?: string) {
    await this.getVoucherById(id);

    const updated = await prisma.voucher.update({
      where: { id },
      data: input
    });

    await prisma.auditLog.create({
      data: {
        action: 'VOUCHER_UPDATED',
        targetType: 'Voucher',
        targetId: updated.id,
        actorId,
        actorName,
        metadata: {
          changes: input
        }
      }
    });

    return updated;
  }

  static async deleteVoucher(id: number, actorId?: number, actorName?: string) {
    const voucher = await this.getVoucherById(id);

    const ordersCount = await prisma.order.count({
      where: { voucherId: id }
    });

    if (ordersCount > 0) {
      await prisma.voucher.update({
        where: { id },
        data: { isActive: false }
      });
    } else {
      await prisma.voucher.delete({
        where: { id }
      });
    }

    await prisma.auditLog.create({
      data: {
        action: 'VOUCHER_DELETED',
        targetType: 'Voucher',
        targetId: voucher.id,
        actorId,
        actorName,
        metadata: {
          code: voucher.code,
          softDeleted: ordersCount > 0
        }
      }
    });

    return { success: true, softDeleted: ordersCount > 0 };
  }

  static calculateDiscount(voucher: Voucher, orderAmount: number, now = new Date()): VoucherCalculationResult {
    if (!voucher.isActive) {
      throw new ApiError(400, 'VOUCHER_INACTIVE', `Mã voucher "${voucher.code}" hiện đang bị tạm khóa`);
    }

    if (now < voucher.startDate) {
      throw new ApiError(400, 'VOUCHER_NOT_STARTED', `Mã voucher "${voucher.code}" chưa đến thời gian áp dụng`);
    }

    if (now > voucher.endDate) {
      throw new ApiError(400, 'VOUCHER_EXPIRED', `Mã voucher "${voucher.code}" đã hết hạn sử dụng`);
    }

    if (voucher.usedCount >= voucher.usageLimit) {
      throw new ApiError(400, 'VOUCHER_USAGE_EXHAUSTED', `Mã voucher "${voucher.code}" đã hết số lượt sử dụng`);
    }

    if (orderAmount < voucher.minOrderValue) {
      throw new ApiError(
        400,
        'MIN_ORDER_VALUE_NOT_MET',
        `Đơn hàng chưa đạt giá trị tối thiểu ${voucher.minOrderValue.toLocaleString('vi-VN')}đ để áp dụng voucher này`
      );
    }

    let rawDiscount = 0;
    if (voucher.discountType === 'PERCENTAGE') {
      rawDiscount = Math.round((orderAmount * voucher.discountValue) / 100);
      if (voucher.maxDiscount && rawDiscount > voucher.maxDiscount) {
        rawDiscount = voucher.maxDiscount;
      }
    } else {
      rawDiscount = voucher.discountValue;
    }

    const discountAmount = Math.min(rawDiscount, orderAmount);
    const taxableAmount = Math.max(0, orderAmount - discountAmount);
    const vatAmount = Math.round(taxableAmount * 0.08);
    const finalAmount = taxableAmount + vatAmount;

    return {
      voucherId: voucher.id,
      code: voucher.code,
      title: voucher.title,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      discountAmount,
      taxableAmount,
      vatAmount,
      finalAmount
    };
  }

  static async validateVoucher(code: string, orderAmount: number) {
    const normalizedCode = code.toUpperCase().trim();
    const voucher = await prisma.voucher.findUnique({
      where: { code: normalizedCode }
    });

    if (!voucher) {
      throw new ApiError(404, 'VOUCHER_NOT_FOUND', `Mã voucher "${normalizedCode}" không tồn tại trong hệ thống`);
    }

    return this.calculateDiscount(voucher, orderAmount);
  }
}
