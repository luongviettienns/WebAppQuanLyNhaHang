import { describe, expect, it } from 'vitest';
import {
  formatDateVn,
  getOrderDatePresets,
  isDatePresetActive,
  isValidDateString
} from './orderDateFilterViewModel';

describe('order date filter view model', () => {
  it('formats dates according to Vietnam timezone in YYYY-MM-DD', () => {
    // 2026-10-08T01:00:00Z is 08:00:00 in Vietnam (UTC+7)
    const d = new Date('2026-10-08T01:00:00Z');
    expect(formatDateVn(d)).toBe('2026-10-08');
  });

  it('computes presets for today, yesterday, 7 days, and this month correctly', () => {
    // Fixed test date: 2026-10-08 in Vietnam
    const mockNow = new Date('2026-10-08T08:00:00+07:00');
    const presets = getOrderDatePresets(mockNow);

    expect(presets.today).toEqual({
      label: 'Hôm nay',
      from: '2026-10-08',
      to: '2026-10-08'
    });

    expect(presets.yesterday).toEqual({
      label: 'Hôm qua',
      from: '2026-10-07',
      to: '2026-10-07'
    });

    expect(presets.last7Days).toEqual({
      label: '7 ngày',
      from: '2026-10-02',
      to: '2026-10-08'
    });

    expect(presets.thisMonth).toEqual({
      label: 'Tháng này',
      from: '2026-10-01',
      to: '2026-10-08'
    });
  });

  it('determines if a preset is active based on from and to range', () => {
    const preset = { from: '2026-10-08', to: '2026-10-08' };
    expect(isDatePresetActive(preset, '2026-10-08', '2026-10-08')).toBe(true);
    expect(isDatePresetActive(preset, '2026-10-07', '2026-10-08')).toBe(false);
    expect(isDatePresetActive(preset, '', '')).toBe(false);
  });

  it('validates YYYY-MM-DD format correctly', () => {
    expect(isValidDateString('2026-10-08')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false); // 2026 is not leap year
    expect(isValidDateString('08/10/2026')).toBe(false);
    expect(isValidDateString('')).toBe(false);
  });
});
