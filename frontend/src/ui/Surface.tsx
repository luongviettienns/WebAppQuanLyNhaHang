import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { elevation, radii } from '../theme';

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

  return <View style={[styles.surface, { backgroundColor }, level === 'raised' && elevation.floatingAction, style]}>{children}</View>;
};

const styles = StyleSheet.create({ surface: { borderRadius: radii.md } });
