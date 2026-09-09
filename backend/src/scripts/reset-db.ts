import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { seedDatabase } from '../../prisma/seed';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ Khong tim thay DATABASE_URL trong bien moi truong!');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  }
});

export async function resetDatabase() {
  console.log('🔄 Dang tien hanh dat lai CSDL ve trang thai mac dinh ban dau...');

  try {
    // 1. Tat kiem tra khoa ngoai
    await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 0;`);

    // 2. Xoa sach cac bang du lieu
    const tables = [
      'OrderItem',
      'Order',
      'ModifierOption',
      'ModifierGroup',
      'MenuItem',
      'Category',
      'DiningTable',
      'User'
    ];

    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\`;`);
        console.log(`  - Da xoa du lieu bang: ${table}`);
      } catch (err) {
        console.warn(`  ! Khong the truncate bang ${table}:`, err);
      }
    }

    // 3. Bat lai kiem tra khoa ngoai
    await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 1;`);

    // 4. Seed lai du lieu chuan ban dau
    await seedDatabase(prisma);

    console.log('\n=============================================================');
    console.log('🎉 DAT LAI CSDL THANH CONG 100%! SAN SANG CHO DEMO');
    console.log('   - 3 Tai khoan: admin / cashier / kitchen (pass: role123)');
    console.log('   - 12 Ban an trang thai AVAILABLE');
    console.log('   - 5 Danh muc va 21+ Mon an day du modifiers & gia chuan');
    console.log('=============================================================\n');
  } catch (error) {
    console.error('❌ Loi khi reset CSDL:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  resetDatabase();
}
