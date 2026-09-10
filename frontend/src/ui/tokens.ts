import { statusColors } from '../theme';

export const buttonMetrics = {
  primary: { minHeight: 52, horizontalPadding: 20 },
  secondary: { minHeight: 44, horizontalPadding: 16 },
  quiet: { minHeight: 44, horizontalPadding: 12 },
  danger: { minHeight: 44, horizontalPadding: 16 }
} as const;

export const statusTone = {
  neutral: { ...statusColors.neutral, foreground: statusColors.neutral.text, label: 'standard' },
  info: { ...statusColors.info, foreground: statusColors.info.text, label: 'informational' },
  success: { ...statusColors.success, foreground: statusColors.success.text, label: 'confirmed' },
  warning: { ...statusColors.warning, foreground: statusColors.warning.text, label: 'attention' },
  danger: { ...statusColors.danger, foreground: statusColors.danger.text, label: 'critical' }
} as const;

export type StatusTone = keyof typeof statusTone;
