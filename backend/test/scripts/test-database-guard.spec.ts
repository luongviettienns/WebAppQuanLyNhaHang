import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseTarget } from '../../scripts/test-database-guard';

describe('test database safety guard', () => {
  it('requires an explicit TEST_DATABASE_URL instead of falling back to DATABASE_URL', () => {
    expect(() => resolveTestDatabaseTarget({ DATABASE_URL: 'mysql://user:secret@localhost/restaurant_test' }))
      .toThrow(/TEST_DATABASE_URL/);
  });

  it('rejects the development database even when the test URL is missing', () => {
    expect(() => resolveTestDatabaseTarget({ DATABASE_URL: 'mysql://user:secret@localhost/restaurant_dev' }))
      .toThrow(/TEST_DATABASE_URL/);
  });

  it('rejects a target equal to DATABASE_URL', () => {
    const url = 'mysql://user:secret@localhost/restaurant_test';

    expect(() => resolveTestDatabaseTarget({ TEST_DATABASE_URL: url, DATABASE_URL: url }))
      .toThrow(/different database/);
  });

  it('rejects the same schema if credentials or query options differ', () => {
    expect(() => resolveTestDatabaseTarget({
      TEST_DATABASE_URL: 'mysql://test_user:test_pass@db.example/restaurant_test?connection_limit=2',
      DATABASE_URL: 'mysql://dev_user:dev_pass@db.example/restaurant_test?connection_limit=10'
    })).toThrow(/different database/);
  });

  it('requires a database name that clearly identifies a test database', () => {
    expect(() => resolveTestDatabaseTarget({
      TEST_DATABASE_URL: 'mysql://user:secret@localhost/restaurant_development',
      DATABASE_URL: 'mysql://user:secret@localhost/restaurant_dev'
    })).toThrow(/dedicated test database/);
  });

  it('returns only the explicitly configured test target and its database name', () => {
    const url = 'mysql://user:secret@localhost/restaurant_test?connection_limit=2';
    const target = resolveTestDatabaseTarget({
      TEST_DATABASE_URL: url,
      DATABASE_URL: 'mysql://user:secret@localhost/restaurant_dev'
    });

    expect(target).toEqual({ url, databaseName: 'restaurant_test' });
  });
});
