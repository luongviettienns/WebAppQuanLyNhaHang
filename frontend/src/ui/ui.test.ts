import { describe, expect, it } from 'vitest';
import { buttonMetrics, buttonTone, fieldState, statusTone, surfaceTreatment } from './tokens';
import { darkTheme, lightTheme } from '../theme';

const contrastRatio = (first: string, second: string) => {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/.{2}/g)?.map((channel) => parseInt(channel, 16) / 255);
    if (!channels) throw new Error(`Expected a six-digit hex color, received ${hex}`);

    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );

    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };

  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

describe('UI primitives', () => {
  it('keeps operational text and selected filters readable in both themes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const foreground of [theme.primary, theme.danger, theme.warning]) {
        for (const background of [theme.surfaceBase, theme.surfaceRaised, theme.surfaceSunken, theme.interactiveSecondary]) {
          expect.soft(contrastRatio(foreground, background), `${theme.mode}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrastRatio(theme.textInverse, theme.interactivePrimary)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps primary operational buttons at least 52px high', () => {
    expect(buttonMetrics.primary.minHeight).toBeGreaterThanOrEqual(52);
  });

  it('uses distinct status semantics', () => {
    expect(statusTone.success.foreground).not.toBe(statusTone.warning.foreground);
    expect(statusTone.danger.label).toBe('critical');
  });

  it('keeps dark operational button labels at WCAG AA contrast', () => {
    expect(contrastRatio(buttonTone.primary.dark.foreground, buttonTone.primary.dark.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(buttonTone.danger.dark.foreground, buttonTone.danger.dark.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps dark operational pressed feedback distinct and accessible', () => {
    expect(buttonTone.primary.dark.pressed).not.toBe(buttonTone.primary.dark.background);
    expect(buttonTone.danger.dark.pressed).not.toBe(buttonTone.danger.dark.background);
    expect(contrastRatio(buttonTone.primary.dark.foreground, buttonTone.primary.dark.pressed)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(buttonTone.danger.dark.foreground, buttonTone.danger.dark.pressed)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses border hierarchy for raised surfaces and semantic colors for disabled fields', () => {
    expect(surfaceTreatment.raised).toEqual({ borderWidth: 1, elevation: 0 });
    expect(fieldState.disabled).toEqual({
      background: 'surfaceSunken',
      border: 'borderSubtle',
      text: 'textSecondary',
      placeholder: 'textSecondary'
    });
  });
});
