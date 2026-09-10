import React, { useState } from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { radii, spacing, typography } from '../theme';

export interface FieldProps extends TextInputProps {
  label: string;
  description?: string;
  error?: string;
  testID?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  description,
  error,
  testID,
  onBlur,
  onFocus,
  accessibilityLabel,
  style: inputStyle,
  ...inputProps
}) => {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const helperText = error || description;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textPrimary }]}>{label}</Text>
      <TextInput
        {...inputProps}
        testID={testID}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityState={{ disabled: inputProps.editable === false }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: theme.surfaceBase,
            borderColor: error ? theme.danger : focused ? theme.focusRing : theme.borderSubtle,
            color: theme.textPrimary
          },
          inputStyle
        ]}
      />
      {helperText && (
        <Text
          accessibilityLiveRegion={error ? 'assertive' : 'polite'}
          style={[styles.helper, { color: error ? theme.danger : theme.textSecondary }]}
        >
          {helperText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  helper: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs }
});
