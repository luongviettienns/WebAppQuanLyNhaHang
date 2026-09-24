import type { SalesReturnStatus } from '../../api/contracts';

export function formatSalesReturnMoney(value: number): string { return `${value.toLocaleString('vi-VN')} ₫`; }
export function formatSalesReturnDate(value: string): string { return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }); }
export function normalizeReturnQuantity(value: string, remaining: number): number { const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10); return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), remaining) : 0; }
export function calculateReturnTotal(lines: Array<{ quantity: number; unitPrice: number }>): number { return lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0); }
export function getSalesReturnStatusPresentation(status: SalesReturnStatus): { label: string; tone: 'success' | 'danger' } { return status === 'COMPLETED' ? { label: 'Đã trả', tone: 'success' } : { label: 'Đã hủy', tone: 'danger' }; }
