import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function getApiBaseUrl(): string {
  // Neu dang chay tren Web trong browser, luon dung origin hien tai cua trang web
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    if (window.location.origin.startsWith('http')) {
      return window.location.origin;
    }
  }

  if (process.env.EXPO_PUBLIC_API_URL && !process.env.EXPO_PUBLIC_API_URL.includes('localhost')) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Auto-detect host IP from Expo Go Metro bundler host
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:4000`;
    }
  }

  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Platform.OS === 'android') {
    return 'http://192.168.1.7:4000';
  }

  return 'http://localhost:4000';
}

export function getSocketBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    if (window.location.origin.startsWith('http')) {
      return window.location.origin;
    }
  }

  if (process.env.EXPO_PUBLIC_SOCKET_URL && !process.env.EXPO_PUBLIC_SOCKET_URL.includes('localhost')) {
    return process.env.EXPO_PUBLIC_SOCKET_URL;
  }
  return getApiBaseUrl();
}
