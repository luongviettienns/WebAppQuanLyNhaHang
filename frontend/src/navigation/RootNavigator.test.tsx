import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, native } = vi.hoisted(() => ({
  auth: { user: null as { role: string } | null, isRestoringSession: false },
  native: (name: string) => {
    const Component = (props: any) => React.createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  }
}));

vi.mock('react-native', () => ({ ActivityIndicator: native('ActivityIndicator'), StyleSheet: { create: (styles: any) => styles }, View: native('View') }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceCanvas: '#fff', primary: '#00f' } }) }));
vi.mock('../features/auth/LoginScreen', () => ({ LoginScreen: () => React.createElement('Screen', { testID: 'login-screen' }) }));
vi.mock('../features/customer/TableOrderScreen', () => ({ TableOrderScreen: () => React.createElement('Screen', { testID: 'table-order-screen' }) }));
vi.mock('../features/customer/ReservationBookingScreen', () => ({ ReservationBookingScreen: () => React.createElement('Screen', { testID: 'reservation-booking-screen' }) }));
vi.mock('./RoleTabs', () => ({ RoleTabs: () => React.createElement('Screen', { testID: 'management-screen' }) }));
vi.mock('../features/attendance-kiosk/EmployeeAttendanceKioskScreen', () => ({
  EmployeeAttendanceKioskScreen: (props: object) => React.createElement('Screen', { testID: 'attendance-kiosk-screen', ...props })
}));
import { RootNavigator } from './RootNavigator';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('RootNavigator kiosk route', () => {
  beforeEach(() => {
    auth.user = null;
    auth.isRestoringSession = false;
    vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('allows only the fixed kiosk path without an Admin login and never forwards URL secrets', async () => {
    (window as any).location = { pathname: '/kiosk-cham-cong', search: '?credential=should-not-be-read', hash: '#secret=also-not-read' };
    let screen: any;
    await act(async () => { screen = create(<RootNavigator />); });
    const kiosk = screen.root.findByProps({ testID: 'attendance-kiosk-screen' });
    expect(kiosk.props.credential).toBeUndefined();
    expect(kiosk.props.secret).toBeUndefined();
    expect(screen.root.findAllByProps({ testID: 'login-screen' })).toHaveLength(0);
    await act(async () => screen.unmount());
  });

  it('keeps management routes behind the existing login gate', async () => {
    (window as any).location = { pathname: '/employees', search: '', hash: '' };
    let screen: any;
    await act(async () => { screen = create(<RootNavigator />); });
    expect(screen.root.findByProps({ testID: 'login-screen' })).toBeDefined();
    expect(screen.root.findAllByProps({ testID: 'attendance-kiosk-screen' })).toHaveLength(0);
    await act(async () => screen.unmount());
  });
});
