import { ManagedTableInput } from '../../api/tableManagement';

export type TableForm = { displayName: string; areaId: string; seatCount: string; displayOrder: string; note: string };
export const emptyTableForm = (): TableForm => ({ displayName: '', areaId: '', seatCount: '4', displayOrder: '0', note: '' });
export function validateTableForm(form: TableForm) {
  const errors: Partial<Record<keyof TableForm, string>> = {};
  if (form.displayName.trim().length < 2) errors.displayName = 'Tên phòng/bàn phải có ít nhất 2 ký tự';
  const seats = Number(form.seatCount); if (!Number.isInteger(seats) || seats < 1 || seats > 100) errors.seatCount = 'Số ghế phải từ 1 đến 100';
  const order = Number(form.displayOrder); if (!Number.isInteger(order) || order < 0) errors.displayOrder = 'Số thứ tự phải là số nguyên không âm';
  return errors;
}
export function tableFormInput(form: TableForm): ManagedTableInput {
  return { displayName: form.displayName.trim(), areaId: form.areaId ? Number(form.areaId) : null, seatCount: Number(form.seatCount), displayOrder: Number(form.displayOrder), note: form.note.trim() || null };
}
