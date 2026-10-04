import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightTheme, darkTheme } from '../../theme';
import type { EndOfDayReportResponse } from '../../api/endOfDayReports';
vi.mock('../../api/config', () => ({ getApiBaseUrl: () => 'https://report.test' }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin' }) }));
vi.mock('../../api/endOfDayReports', async importOriginal => ({ ...await importOriginal<object>(), fetchEndOfDayReportApi: vi.fn(), downloadEndOfDayReportApi: vi.fn() }));
import { downloadEndOfDayReportApi, EndOfDayReportApiError, fetchEndOfDayReportApi } from '../../api/endOfDayReports';
import { Platform } from 'react-native';
import { chromium } from '@playwright/test';
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
beforeEach(() => { vi.mocked(fetchEndOfDayReportApi).mockResolvedValue(snapshot); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); Platform.OS = 'web'; });
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

describe('report refresh, export and print', () => {
  it('fits all ten printed detail columns on paper while retaining every current-page row', async () => {
    const printedStyles: string[] = [];
    const head = { appendChild: (style: { textContent: string }) => printedStyles.push(style.textContent) };
    const body = { appendChild: vi.fn() };
    const frameDocument = { head, body, createElement: () => ({ textContent: '' }), open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const frame = { style: {}, contentDocument: frameDocument, contentWindow: { focus: vi.fn(), print: vi.fn() }, remove: vi.fn(), setAttribute: vi.fn() };
    const cells = (role: string, prefix: string) => Array.from({ length: 10 }, (_, column) => `<div role="${role}" class="print-cell">${prefix} ${column + 1}</div>`).join('');
    const table = `<div data-testid="report-sheet"><div data-testid="report-detail-scroll"><div class="print-table-container"><div role="table"><div role="row" class="print-row">${cells('columnheader', 'Column')}</div>${Array.from({ length: 50 }, (_, row) => `<div role="row" class="print-row">${cells('cell', `Row ${row + 1}`)}</div>`).join('')}</div></div></div></div>`;
    vi.stubGlobal('document', { styleSheets: [{ cssRules: [{ cssText: '.print-table-container{min-width:1600px}.print-row{display:flex}.print-cell{width:160px;flex-shrink:0;padding:8px;box-sizing:border-box}[data-testid="report-detail-scroll"]{overflow-x:auto}' }] }], querySelector: () => ({ cloneNode: () => ({}) }), createElement: (tag: string) => tag === 'iframe' ? frame : { textContent: '' }, body: { appendChild: vi.fn() } });
    vi.stubGlobal('window', {});
    let screen: any;
    await act(async () => { screen = create(<EndOfDayReportScreen snapshot={{ ...snapshot, metadata: { ...snapshot.metadata, view: 'HORIZONTAL' } }} />); });
    await act(async () => { screen.root.findByProps({ testID: 'report-print' }).props.onPress(); });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1030, height: 700 } });
      await page.setContent(`<style>${printedStyles.join('\n')}</style>${table}`);
      await page.emulateMedia({ media: 'print' });
      const layout = await page.evaluate(() => ({
        bodyRight: document.body.getBoundingClientRect().right,
        rightEdges: Array.from(document.querySelectorAll('[role="columnheader"]')).map(cell => cell.getBoundingClientRect().right),
        bodyRightEdges: Array.from(document.querySelectorAll('[role="cell"]')).map(cell => cell.getBoundingClientRect().right),
        rowCount: document.querySelectorAll('[role="row"]').length,
        finalCell: document.querySelector('[role="table"]')?.lastElementChild?.lastElementChild?.textContent
      }));
      expect(layout.rightEdges).toHaveLength(10);
      expect(Math.max(...layout.rightEdges)).toBeLessThanOrEqual(layout.bodyRight);
      expect(layout.bodyRightEdges).toHaveLength(500);
      expect(Math.max(...layout.bodyRightEdges)).toBeLessThanOrEqual(layout.bodyRight);
      expect(layout.rowCount).toBe(51);
      expect(layout.finalCell).toBe('Row 50 10');
    } finally { await browser.close(); await act(async () => screen.unmount()); }
  }, 15000);
  it('disables export and print only without a usable snapshot and retries initial errors', async () => {
    vi.mocked(fetchEndOfDayReportApi).mockRejectedValueOnce(new Error('Offline')); let screen: any;
    await act(async () => { screen = create(<EndOfDayReportScreen initialFilter={{ date: '2026-10-03' }} />); });
    expect(screen.root.findByProps({ testID: 'report-export' }).props.disabled).toBe(true);
    expect(screen.root.findByProps({ testID: 'report-print' }).props.disabled).toBe(true);
    expect(JSON.stringify(screen.toJSON())).toContain('Offline');
    await act(async () => { await screen.root.findByProps({ testID: 'report-retry' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'report-export' }).props.disabled).toBe(false);
    await act(async () => screen.unmount());
  });
  it('exports the committed filters after draft edits and stale refresh with the old timestamp visible', async () => {
    vi.mocked(fetchEndOfDayReportApi).mockRejectedValueOnce(new Error('Offline'));
    vi.mocked(downloadEndOfDayReportApi).mockResolvedValue(new Blob(['xlsx']));
    const click = vi.fn(); const anchor = { click, href: '', download: '' };
    const revoke = vi.fn();
    vi.stubGlobal('window', { URL: { createObjectURL: () => 'blob:report', revokeObjectURL: revoke } });
    vi.stubGlobal('document', { createElement: () => anchor, body: { appendChild: vi.fn(), removeChild: vi.fn() } });
    let screen: any;
    await act(async () => { screen = create(<EndOfDayReportScreen snapshot={snapshot} initialFilter={{ date: '2026-10-03', customerId: 7, page: 2 }} />); });
    await act(async () => screen.root.findByProps({ accessibilityLabel: 'Ngày báo cáo' }).props.onChangeText('2026-10-04'));
    await act(async () => { await screen.root.findByProps({ testID: 'report-refresh' }).props.onPress(); });
    expect(JSON.stringify(screen.root.findByProps({ testID: 'report-stale' }).props)).toContain('2026-10-03T12:00:01Z');
    expect(screen.root.findByProps({ testID: 'report-export' }).props.disabled).toBe(false);
    await act(async () => { await screen.root.findByProps({ testID: 'report-export' }).props.onPress(); });
    expect(downloadEndOfDayReportApi).toHaveBeenCalledWith('admin', expect.objectContaining({ date: '2026-10-03', customerId: 7 }));
    expect(vi.mocked(downloadEndOfDayReportApi).mock.calls[0][1]).not.toHaveProperty('page');
    expect(click).toHaveBeenCalledOnce(); expect(anchor.download).toContain('2026-10-03'); expect(revoke).toHaveBeenCalledWith('blob:report');
    await act(async () => screen.unmount());
  });
  it('shows 413 narrowing guidance and the existing non-Web download limitation', async () => {
    vi.mocked(downloadEndOfDayReportApi).mockRejectedValueOnce(new EndOfDayReportApiError('Too large', 'REPORT_EXPORT_TOO_LARGE', 413, { estimatedRows: 50001 }));
    vi.stubGlobal('window', {}); vi.stubGlobal('document', {}); let screen: any;
    await act(async () => { screen = create(<EndOfDayReportScreen snapshot={snapshot} />); });
    await act(async () => { await screen.root.findByProps({ testID: 'report-export' }).props.onPress(); });
    expect(JSON.stringify(screen.toJSON())).toContain('thu hẹp'); expect(JSON.stringify(screen.toJSON())).toContain('50001');
    Platform.OS = 'android'; await act(async () => { await screen.root.findByProps({ testID: 'report-export' }).props.onPress(); });
    expect(JSON.stringify(screen.toJSON())).toContain('hỗ trợ trên giao diện Web'); expect(downloadEndOfDayReportApi).toHaveBeenCalledOnce();
    await act(async () => screen.unmount());
  });
  it('prints the current report sheet and its metadata without filters or unloaded rows', async () => {
    const head = { appendChild: vi.fn() }; const body = { appendChild: vi.fn() };
    const frameDocument = { head: head as typeof head | null, body: body as typeof body | null, createElement: () => ({ textContent: '' }), open: () => { frameDocument.head = null; frameDocument.body = null; }, write: () => { frameDocument.head = head; frameDocument.body = body; }, close: vi.fn() };
    const print = vi.fn(); const frame = { style: {}, contentDocument: frameDocument, contentWindow: { focus: vi.fn(), print }, remove: vi.fn(), setAttribute: vi.fn(), onload: null as (() => void) | null };
    const sheet = { cloneNode: vi.fn(() => ({ textContent: 'BÁO CÁO CUỐI NGÀY metadata' })) };
    const selector = vi.fn(() => sheet);
    vi.stubGlobal('document', { styleSheets: [{ cssRules: [{ cssText: '.report-test { color: #24211F; }' }] }], querySelector: selector, createElement: (tag: string) => tag === 'iframe' ? frame : { textContent: '' }, body: { appendChild: vi.fn() } }); vi.stubGlobal('window', {});
    let screen: any;
    await act(async () => { screen = create(<EndOfDayReportScreen snapshot={snapshot} />); });
    await act(async () => { screen.root.findByProps({ testID: 'report-print' }).props.onPress(); frame.onload?.(); });
    expect(selector).toHaveBeenCalledWith('[data-testid="report-print-surface"]'); expect(sheet.cloneNode).toHaveBeenCalledWith(true);
    expect(body.appendChild).toHaveBeenCalledWith(expect.objectContaining({ textContent: 'BÁO CÁO CUỐI NGÀY metadata' })); expect(print).toHaveBeenCalledOnce();
    expect(head.appendChild).toHaveBeenCalledWith(expect.objectContaining({ textContent: expect.stringContaining('.report-test') }));
    await act(async () => screen.unmount());
  });
  it('renders netCashFlow zero when hasData is true and empties only on hasData false', async () => {
    const cashflow: EndOfDayReportResponse = { ...snapshot, metadata: { ...snapshot.metadata, concern: 'CASHFLOW' }, summary: { totalReceipts: 100, totalPayments: 100, netCashFlow: 0, unreconciledCount: 0, byPaymentMethod: [], byAccount: [], byCategory: [], bySource: [], invariantCounters: { totalRows: 2 } } };
    let screen: any; await act(async () => { screen = create(<EndOfDayReportScreen snapshot={cashflow} />); });
    expect(JSON.stringify(screen.toJSON())).toContain('Thu chi thuần'); expect(screen.root.findAllByProps({ testID: 'report-kpis' })).toHaveLength(1);
    await act(async () => screen.update(<EndOfDayReportScreen snapshot={{ ...cashflow, hasData: false }} />));
    expect(screen.root.findAllByProps({ testID: 'report-kpis' })).toHaveLength(0); expect(screen.root.findAllByProps({ testID: 'report-empty' }).length).toBeGreaterThan(0);
    await act(async () => screen.unmount());
  });
});
