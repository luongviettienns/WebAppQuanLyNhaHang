import type { SupplierDto } from '../../api/contracts';
import type { SupplierInput, SupplierListFilter } from '../../api/suppliers';

export const emptySupplierForm = () => ({
  name: '', code: '', phone: '', email: '', identityNumber: '', address: '', province: '', district: '', ward: '',
  taxCode: '', companyName: '', note: '', groupId: null as number | null, isActive: true
});
export type SupplierForm = ReturnType<typeof emptySupplierForm>;
export function supplierToForm(supplier?: SupplierDto | null): SupplierForm {
  const form = emptySupplierForm();
  if (!supplier) return form;
  for (const key of Object.keys(form) as Array<keyof SupplierForm>) {
    if (key === 'groupId') form.groupId = supplier.groupId ?? null;
    else if (key === 'isActive') form.isActive = supplier.isActive;
    else form[key] = supplier[key] || '';
  }
  return form;
}
export function supplierFormInput(form: SupplierForm): SupplierInput {
  const input: SupplierInput = { name: form.name.trim(), groupId: form.groupId };
  if (form.code.trim()) input.code = form.code.trim().toUpperCase();
  for (const key of ['phone', 'email', 'identityNumber', 'address', 'province', 'district', 'ward', 'taxCode', 'companyName', 'note'] as const) input[key] = form[key].trim() || null;
  return input;
}
export function validateSupplierForm(form: SupplierForm): Partial<Record<keyof SupplierForm, string>> {
  const errors: Partial<Record<keyof SupplierForm, string>> = {};
  if (form.name.trim().length < 2) errors.name = 'Nhập tên nhà cung cấp từ 2 ký tự';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Email không hợp lệ';
  if (form.code.trim() && !/^[A-Za-z0-9_-]{2,32}$/.test(form.code.trim())) errors.code = 'Mã gồm 2–32 chữ, số, gạch ngang hoặc gạch dưới';
  return errors;
}
export type SupplierFilterFields = Partial<Record<'from' | 'to' | 'minPurchase' | 'maxPurchase' | 'minDebt' | 'maxDebt', string>>;
export function supplierFilterInput(fields: SupplierFilterFields): SupplierListFilter {
  const filter: SupplierListFilter = {};
  for (const key of ['from', 'to'] as const) {
    const value = fields[key]?.trim();
    if (!value) continue;
    const date = new Date(value + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Ngày phải hợp lệ theo YYYY-MM-DD');
    filter[key] = value;
  }
  for (const key of ['minPurchase', 'maxPurchase', 'minDebt', 'maxDebt'] as const) {
    const value = fields[key]?.trim();
    if (!value) continue;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Số tiền phải là số nguyên không âm');
    filter[key] = Number(value);
  }
  if (filter.from && filter.to && filter.from > filter.to) throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
  for (const [min, max] of [['minPurchase', 'maxPurchase'], ['minDebt', 'maxDebt']] as const) if (filter[min] !== undefined && filter[max] !== undefined && filter[min]! > filter[max]!) throw new Error('Giá trị từ phải nhỏ hơn hoặc bằng giá trị tới');
  return filter;
}
export const supplierMoney = (value?: number) => (value ?? 0).toLocaleString('vi-VN');
