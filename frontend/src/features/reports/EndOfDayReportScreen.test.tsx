import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { lightTheme, darkTheme } from '../../theme';
import type { EndOfDayReportResponse } from '../../api/endOfDayReports';
let width = 1200;
let palette = lightTheme;
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'web' }, useWindowDimensions: () => ({ width, height: 800 }), StyleSheet: { create: (s: unknown) => s } }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: palette }) }));
vi.mock('../../ui/AppIcon', () => ({ AppIcon: () => null }));
import { EndOfDayReportScreen } from './EndOfDayReportScreen';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const snapshot: EndOfDayReportResponse = {
  metadata: { date: '2026-10-03', from: '2026-10-02T17:00:00Z', to: '2026-10-03T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh', asOf: '2026-10-03T12:00:00Z', generatedAt: '2026-10-03T12:00:01Z', concern: 'SALES', view: 'VERTICAL', operatingScope: { code: 'MAIN', name: 'Nhà hàng chính', locked: true } },
  hasData: true, rows: [], pagination: { page: 1, pageSize: 50, totalRows: 51, totalPages: 2 }, filterOptions: {},
  summary: { completedInvoiceCount: 1, grossInvoiceValue: 0, salesReturnValue: 0, netInvoiceValue: 0, goodsAmount: 0, discountAmount: 0, vatAmount: 0, deliveryFee: 0, invariantCounters: { totalRows: 51, legacyPaymentMethodFallbackRows: 1 } }
};
const flatten = (s: any): any => Object.assign({}, ...([s].flat(Infinity).filter(Boolean)));
describe('end-of-day report interface', () => {
  it('renders desktop rail, paired times, locked scope and concern-aware accessible controls', async () => {
    width = 1200; let screen: any;
    await act(async () => { screen = create(<EndOfDayReportScreen snapshot={snapshot} />); });
    expect(flatten(screen.root.findByProps({ testID: 'report-filter-rail' }).props.style).width).toBe(272);
    expect(screen.root.findByProps({ accessibilityLabel: 'Giờ bắt đầu' })).toBeTruthy();
    expect(screen.root.findByProps({ accessibilityLabel: 'Giờ kết thúc' })).toBeTruthy();
    expect(screen.root.findByProps({ accessibilityLabel: 'Mối quan tâm' }).findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(5);
    expect(screen.root.findByProps({ accessibilityLabel: 'Kiểu xem' }).findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(2);
    expect(screen.root.findByProps({ testID: 'filter-paymentMethods' })).toBeTruthy();
    await act(async () => screen.root.findByProps({ testID: 'concern-CANCELLED_ITEMS' }).props.onPress());
    expect(screen.root.findAllByProps({ testID: 'filter-paymentMethods' })).toHaveLength(0);
    expect(screen.root.findByProps({ testID: 'filter-cancelReason' })).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain('Nhà hàng chính');
    expect(JSON.stringify(screen.toJSON())).not.toContain('branchId');
    for (const c of screen.root.findAllByType('Pressable')) expect(flatten(typeof c.props.style === 'function' ? c.props.style({ pressed: false }) : c.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await act(async () => screen.unmount());
  });
  it('uses snapshot metadata/view, preserves quality flags, paginates detail and retains readable mobile/dark print', async () => {
    width = 390; palette = darkTheme; const onPageChange = vi.fn(); let screen: any;
    const horizontal = { ...snapshot, metadata: { ...snapshot.metadata, view: 'HORIZONTAL' as const }, rows: [{ documentCode: 'HD01', occurredAt: '2026-10-03T02:00:00Z', amount: 0, receiverEmployeeId: null, receiverEmployeeName: 'Creator', creatorUserName: 'Creator', recordType: 'INVOICE' }] } as EndOfDayReportResponse;
    await act(async () => { screen = create(<EndOfDayReportScreen snapshot={horizontal} onPageChange={onPageChange} />); });
    expect(flatten(screen.root.findByProps({ testID: 'report-layout' }).props.style).flexDirection).toBe('column');
    expect(flatten(screen.root.findByProps({ testID: 'report-sheet' }).props.style).backgroundColor).toBe(lightTheme.surfaceBase);
    expect(screen.root.findByProps({ testID: 'report-detail-scroll' }).props.horizontal).toBe(true);
    const text = JSON.stringify(screen.toJSON());
    for (const s of ['Asia/Ho_Chi_Minh', '2026-10-03', 'HD01', 'Chưa xác định', 'Phương thức thanh toán lịch sử: 1']) expect(text).toContain(s);
    await act(async () => screen.root.findByProps({ testID: 'report-next-page' }).props.onPress());
    expect(onPageChange).toHaveBeenCalledWith(2);
    await act(async () => screen.unmount()); palette = lightTheme;
  });
  it('distinguishes zero aggregates from no records and blocks incomplete paired times', async () => {
    width = 390; const onApply = vi.fn(); let screen: any;
    await act(async () => { screen = create(<EndOfDayReportScreen snapshot={snapshot} onApply={onApply} />); });
    expect(screen.root.findAllByProps({ testID: 'report-kpis' })).toHaveLength(1);
    expect(screen.root.findAllByProps({ testID: 'report-empty' })).toHaveLength(0);
    await act(async () => screen.root.findByProps({ accessibilityLabel: 'Giờ bắt đầu' }).props.onChangeText('08:00'));
    expect(screen.root.findByProps({ testID: 'report-apply' }).props.disabled).toBe(true);
    await act(async () => screen.update(<EndOfDayReportScreen snapshot={{ ...snapshot, hasData: false }} />));
    expect(screen.root.findAllByProps({ testID: 'report-empty' }).length).toBeGreaterThan(0);
    await act(async () => screen.unmount());
  });
});
