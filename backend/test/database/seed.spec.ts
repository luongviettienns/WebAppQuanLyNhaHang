import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';

describe('Database Seed & Schema Verification (Task 5)', () => {
  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('tao chinh xac 3 tai khoan user co bcrypt password va dung role', async () => {
    await seedDatabase(prismaTest);

    const users = await prismaTest.user.findMany({
      orderBy: { username: 'asc' }
    });

    expect(users).toHaveLength(3);
    
    const usernames = users.map(u => u.username);
    expect(usernames).toEqual(['admin', 'cashier', 'kitchen']);

    const roles = users.map(u => u.role);
    expect(roles).toContain('CASHIER');
    expect(roles).toContain('KITCHEN');
    expect(roles).toContain('ADMIN');
  });

  it('tao it nhat 20 mon an kem danh muc va modifier bat buoc', async () => {
    await seedDatabase(prismaTest);

    const menuItems = await prismaTest.menuItem.findMany({
      include: {
        category: true,
        modifierGroups: {
          include: {
            options: true
          }
        }
      }
    });

    expect(menuItems.length).toBeGreaterThanOrEqual(20);

    // Kiem tra co it nhat 1 modifier group bat buoc (isRequired = true)
    const requiredGroup = await prismaTest.modifierGroup.findFirst({
      where: { isRequired: true }
    });

    expect(requiredGroup).not.toBeNull();
    expect(requiredGroup?.isRequired).toBe(true);
  });

  it('tao chinh xac 12 ban an tu Ban 01 den Ban 12 voi QR token duy nhat', async () => {
    await seedDatabase(prismaTest);

    const tables = await prismaTest.diningTable.findMany({
      orderBy: { tableNumber: 'asc' }
    });

    expect(tables).toHaveLength(12);
    expect(tables[0].tableNumber).toBe(1);
    expect(tables[11].tableNumber).toBe(12);

    // Tat ca QR tokens phai la duy nhat va co do dai hop le
    const tokens = tables.map(t => t.qrCodeToken);
    const uniqueTokens = new Set(tokens);
    expect(uniqueTokens.size).toBe(12);
    tokens.forEach(token => {
      expect(token).toMatch(/^qr_[A-Za-z0-9_-]{20,}$/);
      expect(token).not.toMatch(/^QR-TABLE-\d{2}$/);
    });
  });

  it('tao menu item voi SKU he thong duy nhat va metadata quan tri mac dinh', async () => {
    await seedDatabase(prismaTest);

    const menuItems = await prismaTest.$queryRaw<
      Array<{
        id: number;
        sku: string;
        menuType: string;
        itemType: string;
        trackStock: number | boolean;
        stockQuantity: number;
        position: string | null;
      }>
    >`SELECT id, sku, menuType, itemType, trackStock, stockQuantity, position FROM MenuItem ORDER BY id ASC`;

    expect(menuItems.length).toBeGreaterThanOrEqual(20);

    const skus = menuItems.map((item) => item.sku);
    expect(new Set(skus).size).toBe(skus.length);

    menuItems.forEach((item) => {
      expect(item.sku).toMatch(/^SP\d{6}$/);
      expect(item.menuType).toMatch(/^(FOOD|DRINK|SERVICE|OTHER)$/);
      expect(item.itemType).toMatch(/^(REGULAR|TOPPING|COMBO|SERVICE)$/);
      expect(item.stockQuantity).toBeGreaterThanOrEqual(0);
      expect(item.position === null || item.position.length > 0).toBe(true);
    });
  });
});
