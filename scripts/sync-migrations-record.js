const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envFile = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const migrationsDir = path.resolve(__dirname, '../backend/prisma/migrations');
const entries = fs.readdirSync(migrationsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

function syncDb(dbName, dbUrl) {
  console.log(`\n========================================`);
  console.log(`Syncing migrations metadata for ${dbName}...`);
  console.log(`========================================`);
  
  for (const migration of entries) {
    const res = spawnSync('npx', ['prisma', 'migrate', 'resolve', '--applied', migration], {
      cwd: path.resolve(__dirname, '../backend'),
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
      encoding: 'utf8',
      shell: true
    });
    
    if (res.status === 0) {
      console.log(`  [OK] ${migration}`);
    } else {
      // If already recorded or other notice
      const combined = (res.stdout || '') + (res.stderr || '');
      if (combined.includes('already recorded as applied')) {
        console.log(`  [ALREADY APPLIED] ${migration}`);
      } else {
        console.log(`  [INFO] ${migration}: ${combined.trim().split('\n')[0]}`);
      }
    }
  }
}

if (process.env.TEST_DATABASE_URL) {
  syncDb('crispy_bite_test', process.env.TEST_DATABASE_URL);
}

if (process.env.DATABASE_URL) {
  syncDb('crispy_bite_dev', process.env.DATABASE_URL);
}
