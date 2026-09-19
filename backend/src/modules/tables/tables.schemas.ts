import { z } from 'zod';

export const updateTableStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'DIRTY', 'NEED_CLEANING'], {
    required_error: 'Trạng thái bàn ăn là bắt buộc',
    invalid_type_error: 'Trạng thái bàn ăn phải là AVAILABLE hoặc DIRTY'
  })
});

export type UpdateTableStatusInput = z.infer<typeof updateTableStatusSchema>;
 
export const transferTableSchema = z.object({
  fromTableId: z.number({ required_error: 'Bàn nguồn (fromTableId) là bắt buộc' }).int().positive(),
  toTableId: z.number({ required_error: 'Bàn đích (toTableId) là bắt buộc' }).int().positive()
}).refine(data => data.fromTableId !== data.toTableId, {
  message: 'Bàn nguồn và bàn đích không được trùng nhau',
  path: ['toTableId']
});

export type TransferTableInput = z.infer<typeof transferTableSchema>;
