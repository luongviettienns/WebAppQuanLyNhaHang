import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { EndOfDayReportFilter, EndOfDayReportResponse } from '../../api/endOfDayReports';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../theme';
import { EmptyState } from '../../ui/Feedback';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Surface } from '../../ui/Surface';
import { EndOfDayReportFilters } from './EndOfDayReportFilters';
import { EndOfDayReportView } from './EndOfDayReportView';

// Task 12 supplies the atomic snapshot/request coordinator through these seams.
export interface EndOfDayReportScreenProps {
  snapshot?: EndOfDayReportResponse;
  initialFilter?: EndOfDayReportFilter;
  onApply?: (filter: EndOfDayReportFilter) => void;
  onPageChange?: (page: number) => void;
}
export const EndOfDayReportScreen = ({ snapshot, initialFilter, onApply, onPageChange }: EndOfDayReportScreenProps) => {
  const { theme } = useTheme(); const { width } = useWindowDimensions(); const compact = width < 1024;
  const [filter, setFilter] = useState<EndOfDayReportFilter>(() => initialFilter ?? { concern: 'SALES', view: 'VERTICAL' });
  return <ScrollView testID="reports-end-of-day-shell" style={{ backgroundColor: theme.surfaceCanvas }} contentContainerStyle={styles.container}>
    <ScreenHeader title="Báo cáo cuối ngày" description="Tổng hợp hoạt động trong ngày tại Nhà hàng chính." />
    <View testID="report-layout" style={[styles.layout, { flexDirection: compact ? 'column' : 'row' }]}>
      <View testID="report-filter-rail" style={[styles.rail, { width: compact ? '100%' : 272, backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <EndOfDayReportFilters filter={filter} options={snapshot?.metadata.concern === (filter.concern ?? 'SALES') ? snapshot.filterOptions : {}} onChange={setFilter} canApply={Boolean(onApply)} onApply={() => onApply?.(filter)} />
      </View>
      <Surface level="sunken" style={[styles.viewer, { padding: compact ? spacing.sm : spacing.lg }]}>
        {snapshot ? <EndOfDayReportView snapshot={snapshot} compact={width < 600} onPageChange={onPageChange} /> : <EmptyState title="Chọn phạm vi báo cáo" description="Chọn mối quan tâm, ngày và kiểu xem để tải báo cáo cuối ngày." />}
      </Surface>
    </View>
  </ScrollView>;
};
const styles = StyleSheet.create({ container: { padding: spacing.lg, gap: spacing.lg }, layout: { gap: spacing.md, alignItems: 'flex-start' }, rail: { flexShrink: 0, borderWidth: 1 }, viewer: { flex: 1, minWidth: 0, width: '100%', minHeight: 300 } });
