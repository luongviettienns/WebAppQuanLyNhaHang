import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const { native } = vi.hoisted(() => ({ native: (name: string) => { const Component = (props: any) => React.createElement(name, props, props.children); Component.displayName = name; return Component; } }));
vi.mock('react-native', () => ({ Pressable: native('Pressable'), StyleSheet: { create: (styles: any) => styles }, Text: native('Text'), View: native('View') }));
vi.mock('lucide-react-native', () => ({ UserRound: native('Icon') }));
vi.mock('../../ui', () => ({ AppIcon: () => React.createElement('Icon') }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { primary: '#b42318', focusRing: '#0f6cbd', textPrimary: '#24211f', textSecondary: '#6b6560', borderSubtle: '#d8d4ce', surfaceBase: '#fff', interactiveSecondary: '#fff1dd' } }) }));

import { CommissionAssigneePicker } from './CommissionAssigneePicker';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('CommissionAssigneePicker', () => {
  it('shows a nullable safe option and allows an explicit employee selection', async () => {
    const onChange = vi.fn(); let screen: any;
    await act(async () => { screen = create(<CommissionAssigneePicker lineIndex={2} value={null} assignees={[{ id: 3, code: 'NV003', name: 'An' }]} onChange={onChange} />); });
    expect(screen.root.findByProps({ testID: 'commission-assignee-current-2' }).findByType('Text').props.children).toContain('Chưa gán');
    await act(async () => screen.root.findByProps({ testID: 'commission-assignee-current-2' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-assignee-2-3' }).props.onPress());
    expect(onChange).toHaveBeenCalledWith(3);
    await act(async () => screen.root.findByProps({ testID: 'commission-assignee-current-2' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-assignee-2-none' }).props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
