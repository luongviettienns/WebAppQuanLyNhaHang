const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const { PrismaClient } = require('@prisma/client');

async function applyToDb(name, url) {
  console.log(`Applying migrations to ${name}...`);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const migrationsDir = path.resolve(__dirname, '../backend/prisma/migrations');
    const entries = fs.readdirSync(migrationsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();

    for (const dirName of entries) {
      const sqlFile = path.join(migrationsDir, dirName, 'migration.sql');
      if (!fs.existsSync(sqlFile)) continue;
      console.log(`  -> Running migration: ${dirName}`);
      const sql = fs.readFileSync(sqlFile, 'utf8');
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        try {
          await prisma.$executeRawUnsafe(stmt);
        } catch (e) {
          // Ignore if table/column/index already exists
          if (
            !e.message.includes('already exists') &&
            !e.message.includes('Duplicate column') &&
            !e.message.includes('Duplicate key')
          ) {
            console.log(`     Warning: ${stmt.substring(0, 45)}... -> ${e.message}`);
          }
        }
      }
    }
    console.log(`✅ Applied all migrations to ${name}`);
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
