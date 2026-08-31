export const typography = {
  families: {
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemibold: 'Inter_600SemiBold',
    bodyBold: 'Inter_700Bold',
    operational: 'BarlowCondensed_600SemiBold',
    operationalBold: 'BarlowCondensed_700Bold'
  },
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    display: 32
  },
  weights: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extraBold: '700' as const
  },
  lineHeights: {
    compact: 1.1,
    normal: 1.4,
    relaxed: 1.6
  },
  numeric: {
    fontVariant: ['tabular-nums'] as const
  }
} as const;
