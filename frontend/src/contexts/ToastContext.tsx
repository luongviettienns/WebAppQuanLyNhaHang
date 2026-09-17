import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react-native';
import { radii, spacing, typography } from '../theme';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  title?: string;
  type?: ToastType;
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  showToast: (options: ToastOptions | string) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const toastColors: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: '#F0FDF4', border: '#86EFAC', text: '#15803D', icon: '#16A34A' },
  info: { bg: '#EFF6FF', border: '#93C5FD', text: '#1D4ED8', icon: '#2563EB' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', icon: '#D97706' },
  error: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', icon: '#DC2626' }
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions | string) => {
    const opts: ToastOptions = typeof options === 'string' ? { message: options, type: 'info' } : options;
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    const newToast: ToastItem = {
      ...opts,
      type: opts.type || 'info',
      duration: opts.duration ?? 3500,
      id
    };

    setToasts((prev) => [...prev.slice(-3), newToast]);

    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        hideToast(id);
      }, newToast.duration);
    }
  }, [hideToast]);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <View style={styles.toastContainer}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => hideToast(toast.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const type = toast.type || 'info';
  const colors = toastColors[type];
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-20)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true
      })
    ]).start();
  }, [fadeAnim, slideAnim]);

  const IconComponent = () => {
    const size = 20;
    const color = colors.icon;
    switch (type) {
      case 'success':
        return <CheckCircle2 size={size} color={color} />;
      case 'warning':
        return <AlertCircle size={size} color={color} />;
      case 'error':
        return <XCircle size={size} color={color} />;
      default:
        return <Info size={size} color={color} />;
    }
  };

  return (
    <Animated.View
      style={[
        styles.toastCard,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }]
        }
      ]}
    >
      <View style={styles.iconWrapper}>
        <IconComponent />
      </View>
      <View style={styles.textWrapper}>
        {toast.title ? (
          <Text style={[styles.toastTitle, { color: colors.text }]}>{toast.title}</Text>
        ) : null}
        <Text style={[styles.toastMessage, { color: colors.text }]}>{toast.message}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng thông báo"
        onPress={onDismiss}
        style={styles.closeBtn}
      >
        <X size={16} color={colors.text} />
      </Pressable>
    </Animated.View>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 24 : 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
    elevation: 1000,
    pointerEvents: 'box-none',
    gap: spacing.sm,
    paddingHorizontal: spacing.md
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 460,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
    elevation: 8,
    gap: 12
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  textWrapper: {
    flex: 1,
    gap: 2
  },
  toastTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm,
    fontWeight: '700'
  },
  toastMessage: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: 18
  },
  closeBtn: {
    padding: 4,
    opacity: 0.7
  }
});
