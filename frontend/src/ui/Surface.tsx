import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { radii } from '../theme';
import { surfaceTreatment } from './tokens';

export interface SurfaceProps {
  level: 'base' | 'raised' | 'sunken';
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const Surface: React.FC<SurfaceProps> = ({ level, children, style }) => {
  const { theme } = useTheme();
  const backgroundColor = {
    base: theme.surfaceBase,
    raised: theme.surfaceRaised,
    sunken: theme.surfaceSunken
  }[level];
  const treatment = surfaceTreatment[level];

  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor,
          borderColor: level === 'raised' ? theme.borderSubtle : 'transparent',
          borderWidth: treatment.borderWidth
        },
        style
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({ surface: { borderRadius: radii.md } });
