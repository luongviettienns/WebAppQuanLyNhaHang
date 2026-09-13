import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function getApiBaseUrl(): string {
  // 1. Neu dang chay tren Web trong browser, su dung hostname cua trinh duyet voi port 4000 cua Backend
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname;
    if (window.location.port === '4000') {
      return window.location.origin;
    }
    return `http://${hostname}:4000`;
  }

  if (process.env.EXPO_PUBLIC_API_URL && !process.env.EXPO_PUBLIC_API_URL.includes('localhost')) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 2. Auto-detect host IP tu Expo Go Metro bundler host khi chay tren Mobile that
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

  return 'http://localhost:4000';
}

export function getSocketBaseUrl(): string {
  return getApiBaseUrl();
}
