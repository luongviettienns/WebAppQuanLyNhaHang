import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, relativePath), 'utf8');

const readWorkspaceFile = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', '..', relativePath), 'utf8');

const envValue = (source: string, key: string) =>
  source.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();

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
    const envSource = readWorkspaceFile('.env');
    const authSource = readSource('contexts/AuthContext.tsx');

    expect(authSource).toContain(`p: '${envValue(envSource, 'SEED_CASHIER_PASSWORD')}'`);
    expect(authSource).toContain(`p: '${envValue(envSource, 'SEED_KITCHEN_PASSWORD')}'`);
    expect(authSource).toContain(`p: '${envValue(envSource, 'SEED_ADMIN_PASSWORD')}'`);
  });
});
