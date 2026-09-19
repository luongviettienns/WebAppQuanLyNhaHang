import { z } from 'zod';

export const createVoucherSchema = z.object({
  code: z
    .string({ required_error: 'Mã voucher là bắt buộc' })
    .min(3, 'Mã voucher tối thiểu 3 ký tự')
    .max(50, 'Mã voucher tối đa 50 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã voucher chỉ chứa chữ cái, số, gạch nối hoặc gạch dưới')
    .transform((v) => v.toUpperCase().trim()),
  title: z
    .string({ required_error: 'Tiêu đề voucher là bắt buộc' })
    .min(1, 'Tiêu đề voucher là bắt buộc')
    .max(255, 'Tiêu đề voucher không được quá 255 ký tự'),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
    required_error: 'Loại giảm giá là bắt buộc'
  }),
  discountValue: z
    .number({ required_error: 'Giá trị giảm giá là bắt buộc' })
    .int('Giá trị giảm giá phải là số nguyên')
    .positive('Giá trị giảm giá phải lớn hơn 0'),
  minOrderValue: z
    .number()
    .int('Giá trị đơn tối thiểu phải là số nguyên')
    .nonnegative('Giá trị đơn tối thiểu không được âm')
    .default(0),
  maxDiscount: z
    .number()
    .int('Giảm tối đa phải là số nguyên')
    .positive('Giảm tối đa phải lớn hơn 0')
    .optional()
    .nullable(),
  usageLimit: z
    .number()
    .int('Giới hạn sử dụng phải là số nguyên')
    .positive('Giới hạn sử dụng phải lớn hơn 0')
    .default(100),
  isActive: z.boolean().optional().default(true),
  startDate: z.coerce.date({ required_error: 'Thời gian bắt đầu là bắt buộc' }),
  endDate: z.coerce.date({ required_error: 'Thời gian kết thúc là bắt buộc' })
}).refine((data) => {
  if (data.discountType === 'PERCENTAGE' && data.discountValue > 100) {
    return false;
  }
  return true;
}, {
  message: 'Tỷ lệ phần trăm giảm giá không được vượt quá 100%',
  path: ['discountValue']
}).refine((data) => data.endDate > data.startDate, {
  message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
  path: ['endDate']
});

export type CreateVoucherInput = z.infer<typeof createVoucherSchema>;

export const updateVoucherSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  discountValue: z.number().int().positive().optional(),
  minOrderValue: z.number().int().nonnegative().optional(),
  maxDiscount: z.number().int().positive().optional().nullable(),
  usageLimit: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
}).refine((data) => {
  if (data.discountType === 'PERCENTAGE' && data.discountValue && data.discountValue > 100) {
    return false;
  }
  return true;
}, {
  message: 'Tỷ lệ phần trăm giảm giá không được vượt quá 100%',
  path: ['discountValue']
}).refine((data) => {
  if (data.startDate && data.endDate && data.endDate <= data.startDate) {
    return false;
  }
  return true;
}, {
  message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
  path: ['endDate']
});

export type UpdateVoucherInput = z.infer<typeof updateVoucherSchema>;

export const validateVoucherSchema = z.object({
  code: z
    .string({ required_error: 'Mã voucher là bắt buộc' })
    .min(1, 'Mã voucher là bắt buộc')
    .transform((v) => v.toUpperCase().trim()),
  orderAmount: z
    .number({ required_error: 'Giá trị đơn hàng là bắt buộc' })
    .int('Giá trị đơn hàng phải là số nguyên')
    .positive('Giá trị đơn hàng phải lớn hơn 0')
});

export type ValidateVoucherInput = z.infer<typeof validateVoucherSchema>;
