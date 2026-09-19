import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const devUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL || devUrl;

async function applyToDb(url: string, name: string) {
  console.log(`🚀 Dang apply migration len CSDL: ${name}...`);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const sqlPath = path.resolve(__dirname, '../../prisma/migrations/20260917203000_add_inventory_and_bom/migration.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    const statements = sqlContent
      .split(';')
      .map(s => {
        // Remove line comments
        return s
          .split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
      })
      .filter(s => s.length > 0);

    for (const statement of statements) {
      try {
        console.log(`  -> Executing: ${statement.substring(0, 50).replace(/\n/g, ' ')}...`);
        await prisma.$executeRawUnsafe(statement);
      } catch (err: any) {
        if (err.message?.includes('already exists') || err.message?.includes('Duplicate column')) {
          console.log(`  ℹ️ Lenh da duoc thuc thi truoc do, bo qua.`);
        } else {
          console.error(`  ❌ Loi tai cau lenh: ${statement}`);
          throw err;
        }
      }
    }
    console.log(`✅ Apply migration thanh cong tren ${name}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (devUrl) {
    await applyToDb(devUrl, 'crispy_bite_dev');
  }
  if (testUrl && testUrl !== devUrl) {
    await applyToDb(testUrl, 'crispy_bite_test');
  }
  console.log('🎉 Hoan tat dong bo migration tren ca 2 database dev & test!');
}

main().catch(err => {
  console.error('❌ Loi apply migration:', err);
  process.exit(1);
});
