import { describe, expect, it } from 'vitest';
import { defaultModeForRole, storageKeyForRole } from './colors';
import { typography } from './typography';

describe('role-aware theme', () => {
  it('defaults KDS to dark and other roles to light', () => {
    expect(defaultModeForRole('KITCHEN')).toBe('dark');
    expect(defaultModeForRole('CASHIER')).toBe('light');
    expect(defaultModeForRole('ADMIN')).toBe('light');
    expect(defaultModeForRole('GUEST')).toBe('light');
  });

  it('stores a separate preference for each role', () => {
    expect(storageKeyForRole('KITCHEN')).toBe('crispy_bite_theme_kitchen');
    expect(storageKeyForRole('CASHIER')).toBe('crispy_bite_theme_cashier');
  });

  it('uses pixel line-height tokens for 16px body copy', () => {
    expect(typography.lineHeights.md).toBe(24);
    expect(Number.isInteger(typography.lineHeights.md)).toBe(true);
  });
});
