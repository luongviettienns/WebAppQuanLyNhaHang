import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, relativePath), 'utf8');

const readWorkspaceFile = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', '..', relativePath), 'utf8');

const seededPasswordFallback = (source: string, role: 'ADMIN' | 'CASHIER' | 'KITCHEN') =>
  source.match(new RegExp(`process\\.env\\.SEED_${role}_PASSWORD \\|\\| '([^']+)'`))?.[1];

describe('web warning guards', () => {
  it('does not pass pointerEvents as a View prop in ToastContext', () => {
    const source = readSource('contexts/ToastContext.tsx');

    expect(source).not.toContain('<View pointerEvents=');
  });

  it('uses web-compatible toast shadows instead of deprecated shadow style props', () => {
    const source = readSource('contexts/ToastContext.tsx');

    expect(source).not.toMatch(/\bshadow(?:Color|Offset|Opacity|Radius)\b/);
  });

  it('uses web-compatible elevation tokens instead of deprecated shadow style props', () => {
    const source = readSource('theme/spacing.ts');

    expect(source).not.toMatch(/\bshadow(?:Color|Offset|Opacity|Radius)\b/);
  });

  it('does not pass accessible=false through AppIcon to DOM-backed icons', () => {
    const source = readSource('ui/AppIcon.tsx');

    expect(source).not.toContain('accessible={Boolean(accessibilityLabel)}');
  });

  it('keeps frontend demo login passwords aligned with seeded demo users', () => {
    const seedSource = readWorkspaceFile('backend/prisma/seed.ts');
    const authSource = readSource('contexts/AuthContext.tsx');

    expect(authSource).toContain(`p: '${seededPasswordFallback(seedSource, 'CASHIER')}'`);
    expect(authSource).toContain(`p: '${seededPasswordFallback(seedSource, 'KITCHEN')}'`);
    expect(authSource).toContain(`p: '${seededPasswordFallback(seedSource, 'ADMIN')}'`);
  });
});
