import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EndOfDayFilterOptions, EndOfDayReportFilter } from '../../api/endOfDayReports';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { Button } from '../../ui/Button';
import { CONCERN_OPTIONS, FILTER_LABELS, changeConcern, visibleFiltersForConcern } from './endOfDayReportViewModel';

interface ChoiceProps { label: string; selected: boolean; onPress: () => void; testID?: string; role?: 'radio' | 'checkbox' }
const Choice = ({ label, selected, onPress, testID, role = 'radio' }: ChoiceProps) => {
  const { theme } = useTheme(); const [focused, setFocused] = useState(false);
  return <Pressable testID={testID} accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ checked: selected }} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[styles.choice, { backgroundColor: selected ? theme.interactiveSecondary : theme.surfaceBase, borderColor: focused ? theme.focusRing : selected ? theme.primary : theme.borderSubtle, borderWidth: focused ? 3 : 1 }]}>
    <Text style={[styles.label, { color: theme.textPrimary }]}>{selected ? '● ' : '○ '}{label}</Text>
  </Pressable>;
};
interface InputProps { label: string; value?: string; onChange: (text: string) => void; placeholder?: string }
const Input = ({ label, value, onChange, placeholder }: InputProps) => {
  const { theme } = useTheme(); const [focused, setFocused] = useState(false);
  return <View style={styles.field}><Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text><TextInput accessibilityLabel={label} value={value ?? ''} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.textSecondary} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.surfaceBase, borderColor: focused ? theme.focusRing : theme.borderSubtle, borderWidth: focused ? 3 : 1 }]} /></View>;
};
export interface EndOfDayReportFiltersProps { filter: EndOfDayReportFilter; options: EndOfDayFilterOptions; onChange: (filter: EndOfDayReportFilter) => void; onApply: () => void; canApply?: boolean }
export const EndOfDayReportFilters = ({ filter, options, onChange, onApply, canApply = true }: EndOfDayReportFiltersProps) => {
  const { theme } = useTheme();
  const set = (key: keyof EndOfDayReportFilter, value: unknown) => onChange({ ...filter, [key]: value, page: 1 });
  const invalidTime = Boolean(filter.fromTime || filter.toTime) && (!filter.fromTime || !filter.toTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(filter.fromTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(filter.toTime) || filter.fromTime >= filter.toTime);
  return <View style={styles.filters}>
    <Text style={[styles.heading, { color: theme.textPrimary }]}>Bộ lọc báo cáo</Text>
    <View accessibilityLabel="Phạm vi vận hành cố định" style={[styles.scope, { backgroundColor: theme.surfaceSunken }]}><Text style={[styles.label, { color: theme.textPrimary }]}>Nhà hàng chính</Text><Text style={[styles.label, { color: theme.textSecondary }]}>Phạm vi cố định</Text></View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Mối quan tâm" style={styles.field}><Text style={[styles.label, { color: theme.textSecondary }]}>Mối quan tâm</Text>{CONCERN_OPTIONS.map(option => <Choice key={option.value} testID={`concern-${option.value}`} label={option.label} selected={(filter.concern ?? 'SALES') === option.value} onPress={() => onChange(changeConcern(filter, option.value))} />)}</View>
    <Input label="Ngày báo cáo" value={filter.date} placeholder="YYYY-MM-DD · mặc định hôm nay" onChange={value => set('date', value || undefined)} />
    <View style={styles.timePair}><View style={styles.time}><Input label="Giờ bắt đầu" value={filter.fromTime} placeholder="HH:mm" onChange={value => set('fromTime', value || undefined)} /></View><View style={styles.time}><Input label="Giờ kết thúc" value={filter.toTime} placeholder="HH:mm" onChange={value => set('toTime', value || undefined)} /></View></View>
    <Text style={[styles.label, { color: invalidTime ? theme.danger : theme.textSecondary }]}>{invalidTime ? 'Chọn đủ hai giờ hợp lệ; giờ kết thúc phải sau giờ bắt đầu.' : 'Asia/Ho_Chi_Minh · bỏ trống cả hai để lấy cả ngày'}</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel="Kiểu xem" style={styles.timePair}>{(['VERTICAL', 'HORIZONTAL'] as const).map(view => <View key={view} style={styles.time}><Choice testID={`view-${view}`} label={view === 'VERTICAL' ? 'Dọc' : 'Ngang'} selected={(filter.view ?? 'VERTICAL') === view} onPress={() => set('view', view)} /></View>)}</View>
    {visibleFiltersForConcern(filter.concern ?? 'SALES').map(key => <View key={key} testID={`filter-${key}`} style={styles.field}>
      {key === 'search' || key === 'cancelReason' ? <Input label={FILTER_LABELS[key]} value={filter[key]} onChange={value => set(key, value || undefined)} /> : <>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{FILTER_LABELS[key]}</Text>
        <Choice label="Tất cả" selected={filter[key] === undefined} onPress={() => set(key, undefined)} />
        {(options[key] ?? []).filter(option => option.value !== null).map(option => {
          const multiple = key === 'paymentMethods' || key === 'recordTypes';
          const selected = multiple ? (filter[key] as readonly unknown[] | undefined)?.includes(option.value) ?? false : filter[key] === option.value;
          return <Choice key={`${typeof option.value}:${option.value}`} role={multiple ? 'checkbox' : 'radio'} label={option.label} selected={selected} onPress={() => {
            const list: unknown[] = multiple ? [...(filter[key] as readonly unknown[] ?? [])] : [];
            const next = selected ? list.filter(v => v !== option.value) : [...list, option.value];
            set(key, multiple ? next.length ? next : undefined : option.value);
          }} />;
        })}
      </>}
    </View>)}
    <Button testID="report-apply" label="Xem báo cáo" disabled={invalidTime || !canApply} onPress={onApply} />
  </View>;
};
const styles = StyleSheet.create({
  filters: { padding: spacing.md, gap: spacing.md }, heading: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  field: { gap: spacing.xs }, scope: { padding: spacing.sm, gap: spacing.xs }, timePair: { flexDirection: 'row', gap: spacing.sm }, time: { flex: 1, minWidth: 0 },
  label: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 4 },
  input: { minHeight: 44, paddingHorizontal: spacing.sm, fontFamily: typography.families.body, fontSize: typography.sizes.sm, borderRadius: 4 }
});
