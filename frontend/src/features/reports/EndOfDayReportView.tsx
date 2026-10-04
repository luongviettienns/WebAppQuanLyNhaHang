import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { EndOfDayReportResponse } from '../../api/endOfDayReports';
import { lightTheme, spacing, typography } from '../../theme';
import { Button } from '../../ui/Button';
import { InlineAlert } from '../../ui/Feedback';
import { CONCERN_OPTIONS, DETAIL_HEADERS, detailCells, formatNumber, formatTimestamp, qualityFlags, summarySections } from './endOfDayReportViewModel';

export interface EndOfDayReportViewProps { snapshot: EndOfDayReportResponse; compact: boolean; onPageChange?: (page: number) => void }
const EMPTY_TITLES = {
  SALES: 'Không có hóa đơn bán hàng trong phạm vi đã chọn.',
  CASHFLOW: 'Không có giao dịch thu hoặc chi trong phạm vi đã chọn.',
  GOODS: 'Không phát sinh hoạt động hàng hóa trong phạm vi đã chọn.',
  CANCELLED_ITEMS: 'Không có món hoặc đơn bị hủy trong phạm vi đã chọn.',
  SUMMARY: 'Không có hoạt động trong ngày trong phạm vi đã chọn.',
};
export const EndOfDayReportView = ({ snapshot, compact, onPageChange }: EndOfDayReportViewProps) => {
  const { metadata, summary, rows, pagination } = snapshot;
  const flags = qualityFlags(summary.invariantCounters);
  return <View testID="report-sheet" style={styles.sheet}>
    <Text accessibilityRole="header" style={styles.title}>BÁO CÁO CUỐI NGÀY</Text>
    <Text style={styles.subtitle}>{CONCERN_OPTIONS.find(x => x.value === metadata.concern)!.label} · {metadata.operatingScope.name}</Text>
    <View style={styles.metadata}>
      <Text style={styles.copy}>Ngày báo cáo: {metadata.date} · {metadata.timezone}</Text>
      <Text style={styles.copy}>Khoảng dữ liệu: [{formatTimestamp(metadata.from)}, {formatTimestamp(metadata.to)})</Text>
      <Text style={styles.copy}>Dữ liệu đến: {formatTimestamp(metadata.asOf)}</Text>
      <Text style={styles.copy}>Tạo báo cáo: {formatTimestamp(metadata.generatedAt)}</Text>
    </View>
    {flags.length ? <InlineAlert tone="warning" title="Lưu ý chất lượng dữ liệu" message={flags.join(' · ')} /> : null}
    {!snapshot.hasData ? <View testID="report-empty" style={styles.empty}><Text style={styles.sectionTitle}>{EMPTY_TITLES[metadata.concern]}</Text><Text style={styles.copy}>Thử đổi ngày hoặc điều chỉnh bộ lọc.</Text></View> : metadata.view === 'VERTICAL' ? <View testID="report-kpis" style={styles.sections}>
      {summarySections(summary).map(section => <View key={section.title} style={styles.sections}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
        <View style={styles.metrics}>{section.metrics.map(metric => <View key={metric.label} style={[styles.metric, { width: compact ? '48%' : '23%' }]}><Text style={styles.copy}>{metric.label}</Text><Text style={styles.number}>{formatNumber(metric.value)}</Text></View>)}</View>
        {section.breakdowns.map(breakdown => <View key={breakdown.title} style={styles.sections}><Text style={styles.sectionTitle}>{breakdown.title}</Text>{breakdown.entries.length ? breakdown.entries.map((entry, index) => <View key={`${entry.label}:${index}`} style={styles.breakdown}><Text style={styles.copy}>{entry.label}</Text><Text style={styles.copy}>{entry.metrics.map(metric => `${metric.label}: ${formatNumber(metric.value)}`).join(' · ')}</Text></View>) : <Text style={styles.copy}>Không có bản ghi</Text>}</View>)}
      </View>)}
    </View> : <View style={styles.sections}>
      <ScrollView testID="report-detail-scroll" horizontal accessibilityLabel="Chi tiết báo cáo, cuộn ngang để xem các cột" contentContainerStyle={styles.table}>
        <View role="table"><View role="row" style={styles.tableRow}>{DETAIL_HEADERS.map(label => <Text key={label} role="columnheader" style={[styles.cell, styles.columnTitle]}>{label}</Text>)}</View>
          {rows.map((row, index) => <View key={'sourceKey' in row ? row.sourceKey : 'rowKey' in row ? row.rowKey : 'key' in row ? row.key : `${'orderId' in row ? row.orderId : ''}:${'orderReturnId' in row ? row.orderReturnId : ''}:${index}`} role="row" style={styles.tableRow}>{detailCells(row).map((cell, column) => <Text key={column} role="cell" style={[styles.cell, column === 3 || column === 8 ? styles.operational : undefined]}>{cell}</Text>)}</View>)}
        </View>
      </ScrollView>
      {!rows.length ? <Text style={styles.copy}>Trang này không có bản ghi chi tiết.</Text> : null}
      <View style={styles.pagination}><Button testID="report-prev-page" variant="quiet" label="Trang trước" disabled={!onPageChange || pagination.page <= 1} onPress={() => onPageChange?.(pagination.page - 1)} /><Text style={styles.copy}>Trang {pagination.page}/{Math.max(1, pagination.totalPages)} · {pagination.totalRows} dòng</Text><Button testID="report-next-page" variant="quiet" label="Trang sau" disabled={!onPageChange || pagination.page >= pagination.totalPages} onPress={() => onPageChange?.(pagination.page + 1)} /></View>
    </View>}
    <Text style={styles.footer}>Nhà hàng chính · Phạm vi vận hành cố định · Số liệu theo thời điểm nghiệp vụ</Text>
  </View>;
};
const styles = StyleSheet.create({
  sheet: { backgroundColor: lightTheme.surfaceBase, padding: spacing.lg, gap: spacing.md, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xxl, color: lightTheme.textPrimary, textAlign: 'center' },
  subtitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, color: lightTheme.textPrimary, textAlign: 'center' },
  copy: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, color: lightTheme.textPrimary },
  metadata: { gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: lightTheme.borderSubtle, paddingBottom: spacing.md }, sections: { gap: spacing.md },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, color: lightTheme.textPrimary },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  metric: { borderBottomWidth: 1, borderBottomColor: lightTheme.borderSubtle, paddingVertical: spacing.sm, gap: spacing.xs },
  number: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, color: lightTheme.textPrimary },
  breakdown: { borderBottomWidth: 1, borderBottomColor: lightTheme.borderSubtle, paddingVertical: spacing.sm, gap: spacing.xs },
  table: { minWidth: 1600 }, tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: lightTheme.borderSubtle },
  cell: { width: 160, padding: spacing.sm, fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, color: lightTheme.textPrimary },
  columnTitle: { backgroundColor: lightTheme.surfaceCanvas, fontFamily: typography.families.bodySemibold }, operational: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.md },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between' },
  empty: { paddingVertical: spacing.xl, gap: spacing.sm }, footer: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, color: lightTheme.textSecondary, borderTopWidth: 1, borderTopColor: lightTheme.borderSubtle, paddingTop: spacing.md }
});
