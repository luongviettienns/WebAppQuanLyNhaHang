import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { resolveTestDatabaseTarget } from './test-database-guard';

const backendDirectory = process.cwd();
if (!fs.existsSync(path.join(backendDirectory, 'prisma', 'schema.prisma'))) {
  throw new Error('Run this guarded migration command from the backend workspace.');
}
dotenv.config({ path: path.resolve(backendDirectory, '../.env') });
dotenv.config({ path: path.resolve(backendDirectory, '.env') });

const target = resolveTestDatabaseTarget(process.env);
const validateOnly = process.argv[2] === '--validate-only';
if (process.argv.length > 2 && !validateOnly) throw new Error('Only --validate-only is supported as an optional argument.');
const args = validateOnly ? ['validate', '--schema', 'prisma/schema.prisma'] : ['migrate', 'deploy'];
console.info(`${validateOnly ? 'Validating Prisma schema against' : 'Applying migrations to'} dedicated test database "${target.databaseName}".`);

const nodeRequire = createRequire(__filename);
const prismaCli = nodeRequire.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, ...args], {
  cwd: backendDirectory,
  env: { ...process.env, DATABASE_URL: target.url },
  stdio: 'inherit'
});

if (result.error) {
  console.error('Could not start Prisma migrate deploy for the verified test database.');
  process.exitCode = 1;
} else if (result.signal) {
  console.error(`Prisma migration was interrupted (${result.signal}).`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
