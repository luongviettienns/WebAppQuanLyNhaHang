import { describe, expect, it } from 'vitest';
import { buttonMetrics, statusTone } from './tokens';

describe('UI primitives', () => {
  it('keeps primary operational buttons at least 52px high', () => {
    expect(buttonMetrics.primary.minHeight).toBeGreaterThanOrEqual(52);
  });

  it('uses distinct status semantics', () => {
    expect(statusTone.success.foreground).not.toBe(statusTone.warning.foreground);
    expect(statusTone.danger.label).toBe('critical');
  });
});
