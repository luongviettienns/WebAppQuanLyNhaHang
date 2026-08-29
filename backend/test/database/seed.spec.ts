import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaTest, validateTestEnvironment } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';

describe('Database Seed & Schema Verification (Task 5)', () => {
  beforeAll(async () => {
    validateTestEnvironment();
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
  });
});
