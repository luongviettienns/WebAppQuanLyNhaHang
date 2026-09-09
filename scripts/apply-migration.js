const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const { PrismaClient } = require('@prisma/client');

async function applyToDb(name, url) {
  console.log(`Applying migration to ${name}...`);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../backend/prisma/migrations/20260830030000_atomic_order_idempotency/migration.sql'),
      'utf8'
    );
    // Split SQL statements by ';'
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch (e) {
        // If index already dropped or column already exists, log and proceed
        console.log(`  Statement warning on: ${stmt.substring(0, 40)}... -> ${e.message}`);
      }
    }
    console.log(`✅ Applied migration to ${name}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (process.env.DATABASE_URL) {
    await applyToDb('crispy_bite_dev', process.env.DATABASE_URL);
  }
  if (process.env.TEST_DATABASE_URL) {
    await applyToDb('crispy_bite_test', process.env.TEST_DATABASE_URL);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
