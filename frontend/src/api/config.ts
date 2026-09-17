import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_CUSTOM_HOST = '@crispy_bite_custom_server_host';

let inMemoryCustomHost: string | null = null;
const listeners = new Set<(newUrl: string) => void>();

// Khoi tao doc tu storage (hoat dong tren ca web va mobile)
(async () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_KEY_CUSTOM_HOST);
      if (saved) inMemoryCustomHost = saved;
    } else {
      const saved = await AsyncStorage.getItem(STORAGE_KEY_CUSTOM_HOST);
      if (saved) inMemoryCustomHost = saved;
    }
  } catch {
    // Bo qua loi doc storage khoi dau
  }
})();

/**
 * Tu dong phat hien IP cua may chu Backend trong bat ky mang Wi-Fi nao.
 * 
 * Thu tu uu tien:
 * 1. IP nguoi dung chu dong cau hinh (neu co luu trong AsyncStorage)
 * 2. Trinh duyet Web: Tu dong lay theo hostname cua trinh duyet (chay duoc tren bat ky may nao mo web qua LAN)
 * 3. Thiet bi di dong (Expo Go): Tu dong lay hostUri cua Metro Bundler (cung mang Wi-Fi voi may tinh chay server)
 * 4. Bien moi truong EXPO_PUBLIC_API_URL
 * 5. Fallback mac dinh: http://localhost:4000
 */
export function getApiBaseUrl(): string {
  // 1. Neu co cau hinh may chu chu dong
  if (inMemoryCustomHost && inMemoryCustomHost.trim().length > 0) {
    const cleaned = inMemoryCustomHost.trim().replace(/\/+$/, '');
    return cleaned.startsWith('http://') || cleaned.startsWith('https://')
      ? cleaned
      : `http://${cleaned}:4000`;
  }

  // 2. Neu dang chay tren Web browser: dung hostname hien tai cua trinh duyet
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname;
    if (window.location.port === '4000') {
      return window.location.origin;
    }
    return `http://${hostname}:4000`;
  }

  // 3. Neu chay tren Expo Go (dien thoai that ket noi qua Wi-Fi)
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:4000`;
    }
  }

  // 4. Fallback tu bien moi truong
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 5. Fallback cuoi cung
  return 'http://localhost:4000';
}

export function getSocketBaseUrl(): string {
  return getApiBaseUrl();
}

/**
 * Luu IP may chu do nguoi dung chi dinh
 */
export async function setCustomServerHost(hostOrIp: string | null): Promise<void> {
  inMemoryCustomHost = hostOrIp ? hostOrIp.trim() : null;
  try {
    if (hostOrIp && hostOrIp.trim()) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_CUSTOM_HOST, hostOrIp.trim());
      }
      await AsyncStorage.setItem(STORAGE_KEY_CUSTOM_HOST, hostOrIp.trim());
    } else {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY_CUSTOM_HOST);
      }
      await AsyncStorage.removeItem(STORAGE_KEY_CUSTOM_HOST);
    }
  } catch (err) {
    console.warn('Khong the luu custom server host:', err);
  }

  const currentUrl = getApiBaseUrl();
  listeners.forEach((fn) => fn(currentUrl));
}

/**
 * Dang ky lang nghe su kien khi URL may chu thay doi
 */
export function onServerConfigChanged(callback: (newUrl: string) => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Kiem tra ping ket noi toi backend server
 */
export async function pingServer(targetUrl?: string): Promise<{ ok: boolean; latencyMs?: number; message?: string }> {
  const base = targetUrl ? targetUrl.replace(/\/+$/, '') : getApiBaseUrl();
  const url = `${base}/health`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      return { ok: true, latencyMs };
    }
    return { ok: false, message: `Máy chủ phản hồi mã lỗi ${res.status}` };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: false, message: 'Hết thời gian chờ (Timeout > 3.5s). Kiểm tra lại Wi-Fi.' };
    }
    return { ok: false, message: err.message || 'Không thể kết nối đến máy chủ' };
  }
}

/**
 * Lay danh sach IP Wi-Fi tu Backend
 */
export async function fetchServerNetworkInfo(): Promise<Array<{ name: string; ip: string; webUrl: string; apiUrl: string }>> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/system/network-info`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.addresses || [];
  } catch {
    return [];
  }
}
