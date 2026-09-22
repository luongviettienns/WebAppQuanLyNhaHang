import { describe, expect, it } from 'vitest';
import { supplierFormInput, emptySupplierForm, validateSupplierForm, supplierFilterInput } from './supplierViewModel';
describe('supplier form and filters', () => {
  it('sends nulls to clear optional values and omits an automatic code', () => {
    const input = supplierFormInput({ ...emptySupplierForm(), name: '  Đại lý A  ', groupId: null });
    expect(input).toMatchObject({ name: 'Đại lý A', email: null, groupId: null, identityNumber: null, companyName: null });
    expect(input.code).toBeUndefined();
  });
  it('rejects invalid email without requiring phone or email', () => {
    expect(validateSupplierForm({ ...emptySupplierForm(), name: 'Đại lý A' })).toEqual({});
    expect(validateSupplierForm({ ...emptySupplierForm(), name: 'Đại lý A', email: 'bad' }).email).toBeTruthy();
  });
  it('rejects impossible dates and reversed monetary bounds', () => {
    expect(() => supplierFilterInput({ from: '2026-02-30' })).toThrow();
    expect(() => supplierFilterInput({ minPurchase: '10', maxPurchase: '1' })).toThrow();
    expect(supplierFilterInput({ minPurchase: '0', from: '2026-09-22' })).toMatchObject({ minPurchase: 0, from: '2026-09-22' });
  });
});
