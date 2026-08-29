import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserDto, Role, LoginResponseDto, ApiErrorResponse, ApiResponse } from '../api/contracts';

interface AuthContextType {
  user: UserDto | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  demoLogin: (role: Role) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  /**
   * Khoi phuc phien dang nhap khi app khoi dong.
   *
   * ⚠️  QUAN TRONG - GIOI HAN PLATFORM:
   * Hien tai dang dung `window.localStorage` (chi hoat dong tren Expo Web / browser).
   * Khi chay tren thiet bi thuc Expo Go (iOS/Android), localStorage KHONG kha dung.
   * TODO Task 8+: Migrate sang `expo-secure-store` (native) voi fallback `AsyncStorage`
   *   import * as SecureStore from 'expo-secure-store';
   *   SecureStore.setItemAsync('crispy_token', token);
   */
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedToken = window.localStorage.getItem('crispy_token');
        const savedUser = window.localStorage.getItem('crispy_user');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      }
    } catch (e) {
      console.warn('Khong the khoi phuc phien dang nhap tu localStorage (chi hoat dong tren web)', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const json = await response.json();

      if (!response.ok) {
        const errJson = json as ApiErrorResponse;
        const msg = errJson.error?.message || 'Đăng nhập thất bại. Vui lòng thử lại.';
        return { success: false, error: msg };
      }

      const successData = (json as ApiResponse<LoginResponseDto>).data;
      setToken(successData.token);
      setUser(successData.user);

      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('crispy_token', successData.token);
        window.localStorage.setItem('crispy_user', JSON.stringify(successData.user));
      }

      return { success: true };
    } catch {
      return {
        success: false,
        error: 'Không thể kết nối đến máy chủ Backend. Vui lòng kiểm tra kết nối mạng.'
      };
    } finally {
      setIsLoading(false);
    }
  };

  const demoLogin = async (role: Role) => {
    const creds: Record<Role, { u: string; p: string }> = {
      CASHIER: { u: 'cashier', p: 'cashier123' },
      KITCHEN: { u: 'kitchen', p: 'kitchen123' },
      ADMIN: { u: 'admin', p: 'admin123' }
    };
    const { u, p } = creds[role];
    await login(u, p);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('crispy_token');
      window.localStorage.removeItem('crispy_user');
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, demoLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phai duoc su dung ben trong AuthProvider');
  }
  return context;
};
