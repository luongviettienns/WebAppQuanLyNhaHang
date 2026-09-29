export interface TestDatabaseEnvironment {
  TEST_DATABASE_URL?: string;
  DATABASE_URL?: string;
}

export interface TestDatabaseTarget {
  url: string;
  databaseName: string;
}

function parseMySqlTarget(value: string, variableName: string): { url: URL; databaseName: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid MySQL connection URL`);
  }
  if (url.protocol !== 'mysql:') throw new Error(`${variableName} must use the mysql: protocol`);

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!databaseName) throw new Error(`${variableName} must include a database name`);
  return { url, databaseName };
}

function targetIdentity(target: { url: URL; databaseName: string }): string {
  return [
    target.url.protocol.toLowerCase(),
    target.url.hostname.toLowerCase(),
    target.url.port || '3306',
    target.databaseName.toLowerCase()
  ].join('|');
}

export function resolveTestDatabaseTarget(environment: TestDatabaseEnvironment): TestDatabaseTarget {
  const testUrl = environment.TEST_DATABASE_URL?.trim();
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required; refusing to fall back to DATABASE_URL');

  const testTarget = parseMySqlTarget(testUrl, 'TEST_DATABASE_URL');
  if (!/(^|[_-])test([_-]|$)/i.test(testTarget.databaseName)) {
    throw new Error('TEST_DATABASE_URL must point to a dedicated test database name');
  }

  const developmentUrl = environment.DATABASE_URL?.trim();
  if (developmentUrl) {
    const developmentTarget = parseMySqlTarget(developmentUrl, 'DATABASE_URL');
    if (targetIdentity(testTarget) === targetIdentity(developmentTarget)) {
      throw new Error('TEST_DATABASE_URL must target a different database from DATABASE_URL');
    }
  }

  return { url: testUrl, databaseName: testTarget.databaseName };
}
