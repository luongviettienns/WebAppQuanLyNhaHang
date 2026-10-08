import React, { useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Calendar, RotateCcw } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon } from '../../ui';
import {
  getOrderDatePresets,
  isDatePresetActive
} from './orderDateFilterViewModel';

export interface OrderDateFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
  testIDPrefix?: string;
}

export const OrderDateFilter: React.FC<OrderDateFilterProps> = ({
  from,
  to,
  onChange,
  label = 'Thời gian',
  testIDPrefix = 'order-date'
}) => {
  const { theme } = useTheme();
  const presets = useMemo(() => getOrderDatePresets(), []);

  const hasActiveFilter = Boolean(from || to);

  const handlePreset = (presetFrom: string, presetTo: string) => {
    onChange(presetFrom, presetTo);
  };

  const handleClear = () => {
    onChange('', '');
  };

  const presetList = [
    presets.today,
    presets.yesterday,
    presets.last7Days,
    presets.thisMonth
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <AppIcon icon={Calendar} color={theme.textSecondary} size={15} />
          <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
        </View>
        {hasActiveFilter && (
          <Pressable
            testID={`${testIDPrefix}-clear-btn`}
            accessibilityRole="button"
            accessibilityLabel="Xóa lọc thời gian"
            onPress={handleClear}
            style={({ pressed }) => [
              styles.clearBtn,
              { opacity: pressed ? 0.7 : 1 }
            ]}
          >
            <AppIcon icon={RotateCcw} color={theme.primary} size={13} />
            <Text style={[styles.clearText, { color: theme.primary }]}>Tất cả</Text>
          </Pressable>
        )}
      </View>

      {/* Quick preset buttons */}
      <View style={styles.presetsGrid}>
        {presetList.map((preset) => {
          const active = isDatePresetActive(preset, from, to);
          return (
            <Pressable
              key={preset.label}
              testID={`${testIDPrefix}-preset-${preset.label}`}
              accessibilityRole="button"
              accessibilityLabel={`Lọc theo ${preset.label}`}
              onPress={() => handlePreset(preset.from, preset.to)}
              style={({ pressed }) => [
                styles.presetBtn,
                {
                  backgroundColor: active
                    ? theme.interactiveSecondary
                    : theme.surfaceBase,
                  borderColor: active ? theme.primary : theme.borderSubtle,
                  opacity: pressed ? 0.8 : 1
                }
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  {
                    color: active ? theme.primary : theme.textPrimary,
                    fontFamily: active
                      ? typography.families.bodySemibold
                      : typography.families.body
                  }
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Interactive date inputs (native datepicker on Web) */}
      <View style={styles.inputsRow}>
        <View style={styles.inputCol}>
          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Từ ngày</Text>
          <TextInput
            testID={`${testIDPrefix}-from-input`}
            accessibilityLabel="Từ ngày"
            value={from}
            onChangeText={(value) => onChange(value, to)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            {...(Platform.OS === 'web' ? ({ type: 'date' } as any) : {})}
            style={[
              styles.dateInput,
              {
                color: theme.textPrimary,
                borderColor: theme.borderSubtle,
                backgroundColor: theme.surfaceBase
              }
            ]}
          />
        </View>

        <View style={styles.inputCol}>
          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Đến ngày</Text>
          <TextInput
            testID={`${testIDPrefix}-to-input`}
            accessibilityLabel="Đến ngày"
            value={to}
            onChangeText={(value) => onChange(from, value)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            {...(Platform.OS === 'web' ? ({ type: 'date' } as any) : {})}
            style={[
              styles.dateInput,
              {
                color: theme.textPrimary,
                borderColor: theme.borderSubtle,
                backgroundColor: theme.surfaceBase
              }
            ]}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 24
  },
  headerTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  label: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  clearBtn: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 2
  },
  clearText: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4
  },
  presetBtn: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4
  },
  presetText: {
    fontSize: typography.sizes.xs,
    textAlign: 'center'
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 6
  },
  inputCol: {
    flex: 1,
    gap: 3
  },
  subLabel: {
    fontFamily: typography.families.body,
    fontSize: 11
  },
  dateInput: {
    borderRadius: radii.sm,
    borderWidth: 1,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs,
    minHeight: 36,
    paddingHorizontal: spacing.xs
  }
});
