import { describe, expect, it } from 'vitest';
import type { ThemeMode } from '../theme/colors';
import { createThemePreferenceCoordinator } from './themePreferenceCoordinator';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

describe('theme preference coordinator', () => {
  it('does not apply a stale restored preference after a manual selection', async () => {
    const appliedModes: ThemeMode[] = [];
    const savedPreference = deferred<ThemeMode | null>();
    const coordinator = createThemePreferenceCoordinator((mode) => {
      appliedModes.push(mode);
    });

    coordinator.restore('dark', savedPreference.promise);
    coordinator.applyManual('light');
    savedPreference.resolve('dark');
    await savedPreference.promise;
    await Promise.resolve();

    expect(appliedModes).toEqual(['dark', 'light']);
  });
});
