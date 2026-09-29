import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createNativeComponent } = vi.hoisted(() => ({
  createNativeComponent: (name: string) => { const C = (props: any) => React.createElement(name, props, props.children); C.displayName = name; return C; }
}));
const api = vi.hoisted(() => ({ previewEmployeeScheduleImportApi: vi.fn(), commitEmployeeScheduleImportApi: vi.fn() }));
vi.mock('react-native', () => ({
  ActivityIndicator: createNativeComponent('ActivityIndicator'), Modal: createNativeComponent('Modal'), Platform: { OS: 'web' },
  Pressable: createNativeComponent('Pressable'), ScrollView: createNativeComponent('ScrollView'), StyleSheet: { create: (s: any) => s },
  Text: createNativeComponent('Text'), View: createNativeComponent('View')
}));
vi.mock('lucide-react-native', () => { const Icon = createNativeComponent('Icon'); return { FileSpreadsheet: Icon, Upload: Icon, X: Icon }; });
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {
  surfaceBase: '#fff', surfaceRaised: '#fff', surfaceSunken: '#f4f3f0', textPrimary: '#24211f', textSecondary: '#6b6560',
  borderSubtle: '#d8d4ce', primary: '#b42318', success: '#15803d', danger: '#b42318', interactivePrimary: '#b42318',
  interactivePrimaryPressed: '#8f1c13', interactiveSecondary: '#fff1dd', interactiveSecondaryPressed: '#f8d9b2',
  interactiveQuiet: '#f4f3f0', interactiveDanger: '#b42318', interactiveDangerPressed: '#8f1c13'
} }) }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api/employeeScheduleManagement', () => api);
vi.mock('../../ui', () => ({
  AppIcon: () => React.createElement('Icon'),
  Button: ({ label, onPress, disabled, loading, testID }: any) => React.createElement('Pressable', { onPress, disabled: disabled || loading, testID }, React.createElement('Text', null, label)),
  InlineAlert: ({ title, message, testID }: any) => React.createElement('Text', { testID }, `${title}: ${message}`),
  Surface: ({ children, style, ...props }: any) => React.createElement('View', { ...props, style }, children)
}));
import { EmployeeScheduleImportModal } from './EmployeeScheduleImportModal';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const validRow = { rowNumber: 2, employeeCode: 'NV001', shiftCode: 'MORNING', workDate: '2026-10-05', repeatWeekly: false, endDate: null };
const validPreview = { fileName: 'lich.csv', totalRows: 1, validRows: [validRow], errorRows: [], canCommit: true };

describe('employee schedule import modal', () => {
  let fileInput: any;
  let saved: ReturnType<typeof vi.fn>;
  let closed: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    saved = vi.fn(); closed = vi.fn();
    api.previewEmployeeScheduleImportApi.mockResolvedValue(validPreview);
    api.commitEmployeeScheduleImportApi.mockResolvedValue({ createdCount: 1, rules: [] });
    fileInput = { files: [{ name: 'lich.csv', size: 128 }], click: vi.fn(function (this: any) { this.onchange?.({} as Event); }) };
    vi.stubGlobal('document', { createElement: vi.fn(() => fileInput) });
    class MockFileReader {
      result: string | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() { this.result = 'data:text/csv;base64,YQ=='; this.onload?.({} as ProgressEvent<FileReader>); }
    }
    vi.stubGlobal('FileReader', MockFileReader);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('previews before commit and refreshes/closes only after the atomic import succeeds', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleImportModal visible onClose={closed} onSaved={saved} onDownloadTemplate={() => undefined} />); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-import-pick-file' }).props.onPress(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(api.previewEmployeeScheduleImportApi).toHaveBeenCalledWith('admin-token', 'lich.csv', 'YQ==');
    expect(screen.root.findAllByType('Text').some((node: any) => node.children.join('') === '1/1 dòng hợp lệ')).toBe(true);
    await act(async () => { screen.root.findByProps({ testID: 'schedule-import-commit' }).props.onPress(); await Promise.resolve(); });
    expect(api.commitEmployeeScheduleImportApi).toHaveBeenCalledWith('admin-token', [validRow]);
    expect(saved).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
    await act(async () => screen.unmount());
  });

  it('blocks oversized files before preview and keeps the modal open', async () => {
    fileInput.files[0].size = 5 * 1024 * 1024 + 1;
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleImportModal visible onClose={closed} onSaved={saved} onDownloadTemplate={() => undefined} />); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-import-pick-file' }).props.onPress(); });
    expect(api.previewEmployeeScheduleImportApi).not.toHaveBeenCalled();
    expect(JSON.stringify(screen.toJSON())).toContain('File import tối đa 5 MB');
    expect(closed).not.toHaveBeenCalled();
    await act(async () => screen.unmount());
  });

  it('preserves preview and surfaces a server conflict when commit revalidation fails', async () => {
    api.commitEmployeeScheduleImportApi.mockRejectedValue(new Error('Một ca đã bị trùng kể từ lúc xem trước'));
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleImportModal visible onClose={closed} onSaved={saved} onDownloadTemplate={() => undefined} />); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-import-pick-file' }).props.onPress(); await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-import-commit' }).props.onPress(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(JSON.stringify(screen.toJSON())).toContain('Một ca đã bị trùng kể từ lúc xem trước');
    expect(screen.root.findAllByType('Text').some((node: any) => node.children.join('') === '1/1 dòng hợp lệ')).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    await act(async () => screen.unmount());
  });
});
