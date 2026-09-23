import { describe, expect, it } from 'vitest';
import { emptyTableForm, tableFormInput, validateTableForm } from './tableManagementViewModel';

describe('table management form', () => {
  it('requires a useful name and valid positive seat count', () => {
    expect(validateTableForm(emptyTableForm())).toMatchObject({ displayName: expect.any(String) });
    expect(validateTableForm({ ...emptyTableForm(), displayName: 'Bàn A', seatCount: '0' })).toMatchObject({ seatCount: expect.any(String) });
  });

  it('normalizes numeric and nullable values for the API', () => {
    expect(tableFormInput({ displayName: '  Bàn VIP  ', areaId: '3', seatCount: '8', displayOrder: '2', note: '  gần cửa  ' })).toEqual({
      displayName: 'Bàn VIP', areaId: 3, seatCount: 8, displayOrder: 2, note: 'gần cửa'
    });
  });
});
