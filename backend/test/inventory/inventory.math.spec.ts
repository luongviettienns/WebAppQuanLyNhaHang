import { describe, it, expect } from 'vitest';
import { calculateNewWeightedAverageCost, calculateRecipeCost } from '../../src/modules/inventory/inventory.math';

describe('Inventory Math - Weighted Average & Negative Stock Offsetting (TDD)', () => {
  describe('calculateNewWeightedAverageCost', () => {
    it('tinh dung gia von binh quan khi ton kho ban dau bang 0', () => {
      const result = calculateNewWeightedAverageCost({
        currentStock: 0,
        currentCost: 0,
        incomingQty: 10,
        incomingCost: 85000
      });

      expect(result.newStock).toBe(10);
      expect(result.newCost).toBe(85000);
    });

    it('tinh dung gia von binh quan gia quyen tieu chuan khi ton kho duong', () => {
      // 10kg @ 80.000d + 10kg @ 90.000d -> 20kg @ 85.000d
      const result = calculateNewWeightedAverageCost({
        currentStock: 10,
        currentCost: 80000,
        incomingQty: 10,
        incomingCost: 90000
      });

      expect(result.newStock).toBe(20);
      expect(result.newCost).toBe(85000);
    });

    it('tinh dung gia von khi so luong va gia le (lam tron VND nguyen)', () => {
      // 5kg @ 80.000d (400k) + 3kg @ 95.000d (285k) = 685k / 8kg = 85.625d -> 85.625
      const result = calculateNewWeightedAverageCost({
        currentStock: 5,
        currentCost: 80000,
        incomingQty: 3,
        incomingCost: 95000
      });

      expect(result.newStock).toBe(8);
      expect(result.newCost).toBe(85625);
    });

    it('quy tac dong bang Q3: khi ton kho dang am va nhap du bu am -> chi tinh gia moi tren phan duong', () => {
      // Ton kho -5kg (gia cu 80.000d), nhap ve 10kg gia 95.000d
      // 5kg bu am, con duong 5kg -> gia phan duong phai la 95.000d (khong dua so am vao lam meo gia)
      const result = calculateNewWeightedAverageCost({
        currentStock: -5,
        currentCost: 80000,
        incomingQty: 10,
        incomingCost: 95000
      });

      expect(result.newStock).toBe(5);
      expect(result.newCost).toBe(95000);
    });

    it('quy tac dong bang Q3: khi ton kho dang am va nhap chua du bu am -> ton van am nhung gia von cap nhat theo lo moi', () => {
      // Ton kho -10kg, nhap ve 6kg gia 90.000d -> ton moi -4kg, gia von 90.000d
      const result = calculateNewWeightedAverageCost({
        currentStock: -10,
        currentCost: 80000,
        incomingQty: 6,
        incomingCost: 90000
      });

      expect(result.newStock).toBe(-4);
      expect(result.newCost).toBe(90000);
    });

    it('nem loi neu so luong nhap <= 0 hoac don gia nhap < 0', () => {
      expect(() =>
        calculateNewWeightedAverageCost({
          currentStock: 10,
          currentCost: 80000,
          incomingQty: 0,
          incomingCost: 90000
        })
      ).toThrow();

      expect(() =>
        calculateNewWeightedAverageCost({
          currentStock: 10,
          currentCost: 80000,
          incomingQty: 5,
          incomingCost: -100
        })
      ).toThrow();
    });
  });

  describe('calculateRecipeCost', () => {
    it('tinh tong gia von dinh luong mon an chinh xac theo cac nguyen lieu BOM', () => {
      const bom = [
        { quantityRequired: 200, costPerUnit: 85 }, // 200g ga * 85d = 17.000d
        { quantityRequired: 150, costPerUnit: 35 }, // 150g khoai * 35d = 5.250d
        { quantityRequired: 30, costPerUnit: 40 }   // 30ml dau * 40d = 1.200d
      ];

      const totalCost = calculateRecipeCost(bom);
      expect(totalCost).toBe(17000 + 5250 + 1200); // 23.450 VND
    });

    it('tra ve 0 neu cong thuc BOM rong', () => {
      expect(calculateRecipeCost([])).toBe(0);
    });
  });
});
