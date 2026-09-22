import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('react-native', () => {
  const component = (name: string) => {
    const Native = (props: any) => React.createElement(name, props, props.children);
    Native.displayName = name;
    return Native;
  };
  return {
    View: component('View'), Text: component('Text'), TextInput: component('TextInput'), Pressable: component('Pressable'),
    ScrollView: component('ScrollView'), Modal: component('Modal'), KeyboardAvoidingView: component('KeyboardAvoidingView'),
    ActivityIndicator: component('ActivityIndicator'), Platform: { OS: 'web' },
    StyleSheet: { create: (value: any) => value }, useWindowDimensions: () => ({ width: 1200, height: 900 })
  };
});
vi.mock('lucide-react-native', () => ({ X: () => null, ChevronDown: () => null, ChevronUp: () => null, Plus: () => null }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'token' }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {} }) }));
vi.mock('../../api/suppliers', () => ({ fetchSupplierGroupsApi: vi.fn(async () => []), createSupplierApi: vi.fn(), updateSupplierApi: vi.fn(), saveSupplierGroupApi: vi.fn() }));
import { createSupplierApi } from '../../api/suppliers';
import { SupplierFormModal } from './SupplierFormModal';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.clearAllMocks());

describe('supplier form', () => {
  it('preserves input after a failed save and returns the created supplier after retry', async () => {
    const onSaved = vi.fn();
    const supplier: any = { id: 12, code: 'NCC000012', name: 'Nhà cung cấp mới', isActive: true };
    vi.mocked(createSupplierApi).mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValueOnce(supplier);
    let screen: any;
    await act(async () => { screen = create(<SupplierFormModal visible onClose={vi.fn()} onSaved={onSaved} />); });
    await act(async () => { screen.root.findAllByType('TextInput').find((input: any) => input.props.testID === 'supplier-name').props.onChangeText('Nhà cung cấp mới'); });
    const save = () => screen.root.findAllByType('Pressable').find((button: any) => button.props.testID === 'supplier-save');
    await act(async () => { await save().props.onPress(); });
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.root.findAllByType('TextInput').find((input: any) => input.props.testID === 'supplier-name').props.value).toBe('Nhà cung cấp mới');
    expect(JSON.stringify(screen.toJSON())).toContain('Mất kết nối');
    await act(async () => { await save().props.onPress(); });
    expect(onSaved).toHaveBeenCalledWith(supplier);
    expect(createSupplierApi).toHaveBeenLastCalledWith('token', expect.objectContaining({ name: 'Nhà cung cấp mới', email: null, groupId: null }));
    await act(async () => screen.unmount());
  });
});
