import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { brandColors, elevation, radii, spacing, typography } from '../../theme';
import { AppIcon } from '../../ui';

interface Props {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (dateStr: string) => void;
  onClose: () => void;
}

function getTodayVN(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

function shiftDays(baseDateStr: string, days: number): string {
  const d = new Date(`${baseDateStr}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

const WEEKDAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const DatePickerModal: React.FC<Props> = ({
  visible,
  selectedDate,
  onSelectDate,
  onClose
}) => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const todayVN = useMemo(() => getTodayVN(), []);

  // State cho tháng/năm đang xem trong lịch (mặc định là tháng của selectedDate)
  const [viewYear, setViewYear] = useState<number>(() => {
    const parts = selectedDate.split('-');
    return parts.length === 3 ? parseInt(parts[0], 10) : new Date().getFullYear();
  });

  const [viewMonth, setViewMonth] = useState<number>(() => {
    const parts = selectedDate.split('-');
    return parts.length === 3 ? parseInt(parts[1], 10) : new Date().getMonth() + 1;
  });

  useEffect(() => {
    if (visible) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        setViewYear(parseInt(parts[0], 10));
        setViewMonth(parseInt(parts[1], 10));
      }
    }
  }, [visible, selectedDate]);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    // Không cho xem các tháng tương lai so với hôm nay
    const [todayY, todayM] = todayVN.split('-').map(Number);
    if (viewYear > todayY || (viewYear === todayY && viewMonth >= todayM)) {
      return;
    }
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const canGoNextMonth = useMemo(() => {
    const [todayY, todayM] = todayVN.split('-').map(Number);
    return viewYear < todayY || (viewYear === todayY && viewMonth < todayM);
  }, [viewYear, viewMonth, todayVN]);

  // Sinh danh sách các ô trong lưới lịch
  const calendarCells = useMemo(() => {
    // Ngày 1 của tháng rơi vào thứ mấy
    // Date: 0: CN, 1: T2, ..., 6: T7
    const firstDayDate = new Date(viewYear, viewMonth - 1, 1);
    const startDayOfWeek = firstDayDate.getDay(); // 0 = Sunday
    // Đổi sang hệ T2 = 0, T3 = 1, ..., CN = 6
    const adjustedStartDay = (startDayOfWeek + 6) % 7;

    // Số ngày trong tháng
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      dayNumber: number | null;
      dateStr: string | null;
      isToday: boolean;
      isSelected: boolean;
      isFuture: boolean;
    }> = [];

    // Các ô trống phía trước
    for (let i = 0; i < adjustedStartDay; i++) {
      cells.push({
        dayNumber: null,
        dateStr: null,
        isToday: false,
        isSelected: false,
        isFuture: false
      });
    }

    // Các ngày trong tháng
    for (let day = 1; day <= daysInMonth; day++) {
      const dayFormatted = String(day).padStart(2, '0');
      const monthFormatted = String(viewMonth).padStart(2, '0');
      const dateStr = `${viewYear}-${monthFormatted}-${dayFormatted}`;

      const isToday = dateStr === todayVN;
      const isSelected = dateStr === selectedDate;
      const isFuture = dateStr > todayVN;

      cells.push({
        dayNumber: day,
        dateStr,
        isToday,
        isSelected,
        isFuture
      });
    }

    return cells;
  }, [viewYear, viewMonth, selectedDate, todayVN]);

  // Các mốc chọn nhanh
  const presets = useMemo(() => {
    const yesterday = shiftDays(todayVN, -1);
    const threeDaysAgo = shiftDays(todayVN, -3);
    const sevenDaysAgo = shiftDays(todayVN, -7);

    // Đầu tháng này
    const [tY, tM] = todayVN.split('-');
    const firstDayOfMonth = `${tY}-${tM}-01`;

    return [
      { label: 'Hôm nay', value: todayVN },
      { label: 'Hôm qua', value: yesterday },
      { label: '3 ngày trước', value: threeDaysAgo },
      { label: '7 ngày trước', value: sevenDaysAgo },
      { label: 'Đầu tháng', value: firstDayOfMonth }
    ];
  }, [todayVN]);

  const handleSelect = (dateStr: string) => {
    onSelectDate(dateStr);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View
          testID="date-picker-modal"
          style={[
            styles.container,
            isMobile && styles.containerMobile,
            elevation.modal,
            { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
            <View style={styles.headerTitleRow}>
              <AppIcon icon={Calendar} color={theme.primary} size={20} />
              <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
                Chọn ngày báo cáo
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng bộ chọn ngày"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }
              ]}
            >
              <AppIcon icon={X} color={theme.textPrimary} size={18} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.contentScroll}>
            {/* Quick Presets */}
            <View style={styles.presetSection}>
              <View style={styles.presetHeader}>
                <AppIcon icon={Sparkles} color={theme.textSecondary} size={14} />
                <Text style={[styles.presetTitle, { color: theme.textSecondary }]}>
                  Chọn nhanh
                </Text>
              </View>
              <View style={styles.presetList}>
                {presets.map((preset) => {
                  const isCurrent = preset.value === selectedDate;
                  return (
                    <Pressable
                      key={preset.label}
                      accessibilityRole="button"
                      accessibilityLabel={`Chọn ${preset.label}`}
                      onPress={() => handleSelect(preset.value)}
                      style={({ pressed }) => [
                        styles.presetChip,
                        {
                          backgroundColor: isCurrent
                            ? brandColors.primary
                            : pressed
                            ? theme.surfaceSunken
                            : theme.surfaceCanvas,
                          borderColor: isCurrent ? brandColors.primary : theme.borderSubtle
                        }
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          {
                            color: isCurrent ? '#FFFFFF' : theme.textPrimary,
                            fontFamily: isCurrent
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
            </View>

            {/* Calendar Section */}
            <View style={[styles.calendarBox, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
              {/* Month Navigation */}
              <View style={styles.monthNavRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tháng trước"
                  onPress={handlePrevMonth}
                  style={({ pressed }) => [
                    styles.navButton,
                    { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }
                  ]}
                >
                  <AppIcon icon={ChevronLeft} color={theme.textPrimary} size={18} />
                </Pressable>

                <Text style={[styles.monthNavTitle, { color: theme.textPrimary }]}>
                  Tháng {viewMonth} / {viewYear}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tháng sau"
                  disabled={!canGoNextMonth}
                  onPress={handleNextMonth}
                  style={({ pressed }) => [
                    styles.navButton,
                    {
                      backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet,
                      opacity: canGoNextMonth ? 1 : 0.3
                    }
                  ]}
                >
                  <AppIcon icon={ChevronRight} color={theme.textPrimary} size={18} />
                </Pressable>
              </View>

              {/* Day of Week Headers */}
              <View style={styles.weekdaysRow}>
                {WEEKDAY_NAMES.map((name) => (
                  <View key={name} style={styles.weekdayCell}>
                    <Text style={[styles.weekdayText, { color: theme.textSecondary }]}>
                      {name}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Day Cells Grid */}
              <View style={styles.gridContainer}>
                {calendarCells.map((cell, idx) => {
                  if (cell.dayNumber === null) {
                    return <View key={`empty-${idx}`} style={styles.dayCell} />;
                  }

                  const isDisabled = cell.isFuture;

                  return (
                    <Pressable
                      key={cell.dateStr}
                      disabled={isDisabled}
                      accessibilityRole="button"
                      accessibilityLabel={`Ngày ${cell.dayNumber}`}
                      onPress={() => cell.dateStr && handleSelect(cell.dateStr)}
                      style={({ pressed }) => [
                        styles.dayCell,
                        styles.dayCellInteractive,
                        cell.isSelected && {
                          backgroundColor: brandColors.primary,
                          borderColor: brandColors.primary
                        },
                        !cell.isSelected && cell.isToday && {
                          borderColor: brandColors.primary,
                          borderWidth: 1.5
                        },
                        !cell.isSelected && pressed && {
                          backgroundColor: theme.surfaceSunken
                        },
                        isDisabled && { opacity: 0.25 }
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          {
                            color: cell.isSelected
                              ? '#FFFFFF'
                              : cell.isToday
                              ? brandColors.primary
                              : theme.textPrimary,
                            fontFamily:
                              cell.isSelected || cell.isToday
                                ? typography.families.operationalBold
                                : typography.families.body
                          }
                        ]}
                      >
                        {cell.dayNumber}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md
  },
  container: {
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: 440,
    width: '100%',
    overflow: 'hidden'
  },
  containerMobile: {
    maxWidth: '100%'
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  headerTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  headerTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.md
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  contentScroll: {
    gap: spacing.md,
    padding: spacing.lg
  },
  presetSection: {
    gap: spacing.xs
  },
  presetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  presetTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase'
  },
  presetList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  presetChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2
  },
  presetChipText: {
    fontSize: typography.sizes.xs
  },
  calendarBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  monthNavRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  navButton: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  monthNavTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.sm
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  weekdayCell: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xs
  },
  weekdayText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  dayCell: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: '14.28%' // 100% / 7
  },
  dayCellInteractive: {
    borderRadius: radii.sm
  },
  dayText: {
    fontSize: typography.sizes.sm
  }
});
