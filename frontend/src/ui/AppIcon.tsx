import React from 'react';
import type { LucideIcon } from 'lucide-react-native';

export interface AppIconProps {
  icon: LucideIcon;
  color: string;
  size?: number;
  accessibilityLabel?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({
  icon: Icon,
  color,
  size = 20,
  accessibilityLabel
}) => {
  const accessibilityProps = accessibilityLabel
    ? { accessibilityLabel, accessible: true }
    : {};

  return (
    <Icon
      color={color}
      size={size}
      strokeWidth={2.25}
      {...accessibilityProps}
    />
  );
};
