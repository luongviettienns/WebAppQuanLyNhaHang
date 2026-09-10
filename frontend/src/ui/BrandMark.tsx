import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { radii, spacing, typography } from '../theme';

export interface BrandMarkProps {
  compact?: boolean;
  testID?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ compact = false, testID }) => {
  const { theme } = useTheme();

  return (
    <View testID={testID} accessibilityRole="header" style={styles.container}>
      <View style={[styles.mark, { backgroundColor: theme.interactivePrimary }]}>
        <Text style={[styles.markText, { color: theme.textInverse }]}>CB</Text>
      </View>
      {!compact && (
        <View>
          <Text style={[styles.name, { color: theme.textPrimary }]}>CRISPY BITE</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>Vận hành nhanh gọn</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  mark: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  markText: { fontFamily: typography.families.operationalBold, fontSize: 18 },
  name: { fontFamily: typography.families.operationalBold, fontSize: 20, letterSpacing: 0.6 },
  tagline: { fontFamily: typography.families.bodyMedium, fontSize: 11, marginTop: -2 }
});
