import { statusColors } from '../theme';

export const buttonMetrics = {
  primary: { minHeight: 52, horizontalPadding: 20 },
  secondary: { minHeight: 44, horizontalPadding: 16 },
  quiet: { minHeight: 44, horizontalPadding: 12 },
  danger: { minHeight: 44, horizontalPadding: 16 }
} as const;

export const buttonTone = {
  primary: {
    dark: { background: '#B42318', pressed: '#8F1C13', foreground: '#FFFFFF' }
  },
  danger: {
    dark: { background: '#B42318', pressed: '#8F1C13', foreground: '#FFFFFF' }
  }
} as const;

export const surfaceTreatment = {
  base: { borderWidth: 0, elevation: 0 },
  raised: { borderWidth: 1, elevation: 0 },
  sunken: { borderWidth: 0, elevation: 0 }
} as const;

export const fieldState = {
  disabled: {
    background: 'surfaceSunken',
    border: 'borderSubtle',
    text: 'textSecondary',
    placeholder: 'textSecondary'
  }
} as const;

export const statusTone = {
  neutral: { ...statusColors.neutral, foreground: statusColors.neutral.text, label: 'standard' },
  info: { ...statusColors.info, foreground: statusColors.info.text, label: 'informational' },
  success: { ...statusColors.success, foreground: statusColors.success.text, label: 'confirmed' },
  warning: { ...statusColors.warning, foreground: statusColors.warning.text, label: 'attention' },
  danger: { ...statusColors.danger, foreground: statusColors.danger.text, label: 'critical' }
} as const;

export type StatusTone = keyof typeof statusTone;
