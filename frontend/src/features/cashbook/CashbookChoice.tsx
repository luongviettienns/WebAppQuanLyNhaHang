import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';

export const Choice: React.FC<{ label: string; value: string; options: string[]; onSelect: (value: string) => void }> = ({ label, value, options, onSelect }) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  return <View style={{ gap: spacing.xs }}>
    <Text style={{ color: theme.textPrimary, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }}>{label}</Text>
    <Pressable accessibilityRole="button" onPress={() => setOpen(current => !current)} style={{ backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md }}><Text style={{ color: theme.textPrimary }}>{value}</Text></Pressable>
    {open && <View style={{ backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle, borderRadius: radii.md, borderWidth: 1, zIndex: 30 }}>{options.map(option => <Text key={option} onPress={() => { onSelect(option); setOpen(false); }} style={{ color: theme.textPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>{option}</Text>)}</View>}
  </View>;
};
