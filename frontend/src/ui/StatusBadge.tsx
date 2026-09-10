import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme';
import { AppIcon } from './AppIcon';
import { StatusTone, statusTone } from './tokens';

export interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
  icon?: LucideIcon;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ tone, label, icon }) => {
  const colors = statusTone[tone];

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${colors.label}: ${label}`}
      style={[styles.badge, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      {icon && <AppIcon icon={icon} color={colors.foreground} size={16} />}
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs }
});
