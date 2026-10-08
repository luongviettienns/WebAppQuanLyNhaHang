import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { OrderDateFilter } from './OrderDateFilter';
import { getOrderDatePresets } from './orderDateFilterViewModel';

const { native } = vi.hoisted(() => ({
  native: (name: string) => {
    const C = (props: any) => React.createElement(name, props, props.children);
    C.displayName = name;
    return C;
  }
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Pressable: native('Pressable'),
  StyleSheet: { create: (s: any) => s },
  Text: native('Text'),
  TextInput: native('TextInput'),
  View: native('View')
}));

vi.mock('lucide-react-native', () => {
  const Icon = native('Icon');
  return {
    Calendar: Icon,
    RotateCcw: Icon
  };
});

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      surfaceBase: '#fff',
      surfaceCanvas: '#f4f3f0',
      surfaceRaised: '#fff',
      interactiveSecondary: '#fff1dd',
      primary: '#b42318',
      textPrimary: '#24211f',
      textSecondary: '#6b6560',
      borderSubtle: '#d8d4ce'
    }
  })
}));

vi.mock('../../theme', () => ({
  radii: { md: 8, sm: 4, pill: 99 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 20 },
  typography: {
    families: { bodySemibold: 'Inter', body: 'Inter', bodyMedium: 'Inter' },
    sizes: { xs: 12, sm: 13, md: 15, lg: 20 }
  }
}));

vi.mock('../../ui', () => ({
  AppIcon: () => React.createElement('Icon')
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('OrderDateFilter component', () => {
  it('renders presets and invokes onChange when a preset is pressed', () => {
    const onChange = vi.fn();
    const presets = getOrderDatePresets();

    let root: any;
    act(() => {
      root = create(<OrderDateFilter from="" to="" onChange={onChange} />);
    });

    const todayBtn = root.root.findByProps({ testID: 'order-date-preset-Hôm nay' });
    expect(todayBtn).toBeDefined();

    act(() => {
      todayBtn.props.onPress();
    });

    expect(onChange).toHaveBeenCalledWith(presets.today.from, presets.today.to);
  });

  it('allows picking custom from and to dates', () => {
    const onChange = vi.fn();
    let root: any;

    act(() => {
      root = create(<OrderDateFilter from="2026-10-01" to="2026-10-05" onChange={onChange} />);
    });

    const fromInput = root.root.findByProps({ testID: 'order-date-from-input' });
    const toInput = root.root.findByProps({ testID: 'order-date-to-input' });

    expect(fromInput.props.value).toBe('2026-10-01');
    expect(toInput.props.value).toBe('2026-10-05');

    act(() => {
      fromInput.props.onChangeText('2026-10-02');
    });
    expect(onChange).toHaveBeenCalledWith('2026-10-02', '2026-10-05');

    act(() => {
      toInput.props.onChangeText('2026-10-08');
    });
    expect(onChange).toHaveBeenCalledWith('2026-10-01', '2026-10-08');
  });

  it('shows clear button when filter is active and clears on press', () => {
    const onChange = vi.fn();
    let root: any;

    act(() => {
      root = create(<OrderDateFilter from="2026-10-08" to="2026-10-08" onChange={onChange} />);
    });

    const clearBtn = root.root.findByProps({ testID: 'order-date-clear-btn' });
    expect(clearBtn).toBeDefined();

    act(() => {
      clearBtn.props.onPress();
    });

    expect(onChange).toHaveBeenCalledWith('', '');
  });
});
