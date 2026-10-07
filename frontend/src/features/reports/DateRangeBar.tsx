import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';

export interface DateRangeBarProps {
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export function formatDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

export function getPresetDates() {
  const now = new Date();
  const todayStr = formatDateStr(now);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDateStr(yesterday);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoStr = formatDateStr(sevenDaysAgo);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthStr = formatDateStr(startOfMonth);

  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const startOfPrevMonthStr = formatDateStr(startOfPrevMonth);
  const endOfPrevMonthStr = formatDateStr(endOfPrevMonth);

  return {
    today: { from: todayStr, to: todayStr },
    yesterday: { from: yesterdayStr, to: yesterdayStr },
    last7Days: { from: sevenDaysAgoStr, to: todayStr },
    thisMonth: { from: startOfMonthStr, to: todayStr },
    lastMonth: { from: startOfPrevMonthStr, to: endOfPrevMonthStr }
  };
}

export const DateRangeBar: React.FC<DateRangeBarProps> = ({
  from,
  to,
  onRangeChange,
  onRefresh,
  loading = false
}) => {
  const { theme } = useTheme();
  const presets = getPresetDates();

  const isPresetActive = (pFrom: string, pTo: string) => from === pFrom && to === pTo;

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
      <View style={styles.presetsRow}>
        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Khoảng thời gian:</Text>
        <Pressable
          testID="preset-today"
          onPress={() => onRangeChange(presets.today.from, presets.today.to)}
          style={[
            styles.presetBtn,
            isPresetActive(presets.today.from, presets.today.to) && {
              backgroundColor: theme.interactiveSecondary,
              borderColor: theme.primary
            }
          ]}
        >
          <Text
            style={[
              styles.presetText,
              { color: isPresetActive(presets.today.from, presets.today.to) ? theme.primary : theme.textPrimary }
            ]}
          >
            Hôm nay
          </Text>
        </Pressable>

        <Pressable
          testID="preset-yesterday"
          onPress={() => onRangeChange(presets.yesterday.from, presets.yesterday.to)}
          style={[
            styles.presetBtn,
            isPresetActive(presets.yesterday.from, presets.yesterday.to) && {
              backgroundColor: theme.interactiveSecondary,
              borderColor: theme.primary
            }
          ]}
        >
          <Text
            style={[
              styles.presetText,
              { color: isPresetActive(presets.yesterday.from, presets.yesterday.to) ? theme.primary : theme.textPrimary }
            ]}
          >
            Hôm qua
          </Text>
        </Pressable>

        <Pressable
          testID="preset-7days"
          onPress={() => onRangeChange(presets.last7Days.from, presets.last7Days.to)}
          style={[
            styles.presetBtn,
            isPresetActive(presets.last7Days.from, presets.last7Days.to) && {
              backgroundColor: theme.interactiveSecondary,
              borderColor: theme.primary
            }
          ]}
        >
          <Text
            style={[
              styles.presetText,
              { color: isPresetActive(presets.last7Days.from, presets.last7Days.to) ? theme.primary : theme.textPrimary }
            ]}
          >
            7 ngày qua
          </Text>
        </Pressable>

        <Pressable
          testID="preset-this-month"
          onPress={() => onRangeChange(presets.thisMonth.from, presets.thisMonth.to)}
          style={[
            styles.presetBtn,
            isPresetActive(presets.thisMonth.from, presets.thisMonth.to) && {
              backgroundColor: theme.interactiveSecondary,
              borderColor: theme.primary
            }
          ]}
        >
          <Text
            style={[
              styles.presetText,
              { color: isPresetActive(presets.thisMonth.from, presets.thisMonth.to) ? theme.primary : theme.textPrimary }
            ]}
          >
            Tháng này
          </Text>
        </Pressable>

        <Pressable
          testID="preset-last-month"
          onPress={() => onRangeChange(presets.lastMonth.from, presets.lastMonth.to)}
          style={[
            styles.presetBtn,
            isPresetActive(presets.lastMonth.from, presets.lastMonth.to) && {
              backgroundColor: theme.interactiveSecondary,
              borderColor: theme.primary
            }
          ]}
        >
          <Text
            style={[
              styles.presetText,
              { color: isPresetActive(presets.lastMonth.from, presets.lastMonth.to) ? theme.primary : theme.textPrimary }
            ]}
          >
            Tháng trước
          </Text>
        </Pressable>
      </View>

      <View style={styles.inputsRow}>
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Từ ngày:</Text>
          <TextInput
            testID="date-from-input"
            value={from}
            onChangeText={(txt) => onRangeChange(txt, to)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.surfaceCanvas }
            ]}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Đến ngày:</Text>
          <TextInput
            testID="date-to-input"
            value={to}
            onChangeText={(txt) => onRangeChange(from, txt)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.surfaceCanvas }
            ]}
          />
        </View>

        {onRefresh && (
          <Pressable
            testID="date-range-refresh-btn"
            onPress={onRefresh}
            disabled={loading}
            style={[styles.refreshBtn, { backgroundColor: theme.primary }, loading && { opacity: 0.6 }]}
          >
            <Text style={styles.refreshBtnText}>{loading ? 'Đang tải...' : 'Xem báo cáo'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: spacing.sm
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs
  },
  filterLabel: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs,
    marginRight: spacing.xs
  },
  presetBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  presetText: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  },
  inputsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  inputLabel: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  },
  input: {
    height: 36,
    minWidth: 120,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  refreshBtn: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  refreshBtnText: {
    color: '#FFFFFF',
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  }
});
