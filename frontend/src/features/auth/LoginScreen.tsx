import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { typography, spacing } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Role } from '../../api/contracts';

export const LoginScreen: React.FC = () => {
  const { login, demoLogin, isLoading } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu');
      return;
    }
    setErrorMessage(null);
    const result = await login(username.trim(), password);
    if (!result.success && result.error) {
      setErrorMessage(result.error);
    }
  };

  const handleDemoLogin = async (role: Role) => {
    setErrorMessage(null);
    const creds: Record<Role, { u: string; p: string }> = {
      CASHIER: { u: 'cashier', p: 'cashier123' },
      KITCHEN: { u: 'kitchen', p: 'kitchen123' },
      ADMIN: { u: 'admin', p: 'admin123' }
    };
    const { u, p } = creds[role];
    setUsername(u);
    setPassword(p);
    const result = await demoLogin(role);
    if (!result.success && result.error) {
      setErrorMessage(result.error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Theme Switcher at Top-Right */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[
            styles.themeToggleBtn,
            { backgroundColor: isDark ? '#334155' : '#FEF3C7', borderColor: isDark ? '#475569' : '#FDE68A' }
          ]}
          onPress={toggleTheme}
          accessibilityLabel="Chuyển đổi giao diện Sáng / Tối"
        >
          <Text style={[styles.themeToggleText, { color: isDark ? '#F8FAFC' : '#B45309' }]}>
            {isDark ? '🌙 Tối' : '☀️ Sáng'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Brand Header */}
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>🍔</Text>
            <Text style={[styles.brandTitle, { color: theme.primary }]}>CRISPY BITE</Text>
            <Text style={[styles.brandSubtitle, { color: theme.textMuted }]}>
              Hệ Thống Đặt Món & Quản Lý Nhà Hàng QSR
            </Text>
          </View>

          {/* Login Card */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Đăng Nhập Hệ Thống</Text>
            <Text style={[styles.cardDesc, { color: theme.textMuted }]}>
              Vui lòng nhập tài khoản được cấp để tiếp tục
            </Text>

            {errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Tên đăng nhập</Text>
              <TextInput
                testID="input-username"
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    borderColor: theme.border,
                    color: theme.text
                  }
                ]}
                placeholder="Nhập tên đăng nhập (cashier, kitchen, admin)..."
                placeholderTextColor={theme.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Mật khẩu</Text>
              <TextInput
                testID="input-password"
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    borderColor: theme.border,
                    color: theme.text
                  }
                ]}
                placeholder="Nhập mật khẩu..."
                placeholderTextColor={theme.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!isLoading}
              />
            </View>

            <TouchableOpacity
              testID="btn-login"
              style={[styles.loginButton, { backgroundColor: theme.primary }, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginButtonText}>ĐĂNG NHẬP</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textMuted }]}>
                HOẶC ĐĂNG NHẬP NHANH (DEMO BAR)
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            {/* Quick Demo Login Bar */}
            <View style={styles.demoBar}>
              <TouchableOpacity
                testID="demo-btn-cashier"
                style={[
                  styles.demoButton,
                  {
                    backgroundColor: isDark ? '#7C2D12' : '#FFEDD5',
                    borderColor: isDark ? '#F97316' : theme.secondary
                  }
                ]}
                onPress={() => handleDemoLogin('CASHIER')}
                disabled={isLoading}
              >
                <Text style={[styles.demoButtonText, { color: isDark ? '#FDBA74' : theme.secondary }]}>
                  👤 Thu Ngân (Cashier)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="demo-btn-kitchen"
                style={[
                  styles.demoButton,
                  {
                    backgroundColor: isDark ? '#075985' : '#E0F2FE',
                    borderColor: isDark ? '#38BDF8' : '#0284C7'
                  }
                ]}
                onPress={() => handleDemoLogin('KITCHEN')}
                disabled={isLoading}
              >
                <Text style={[styles.demoButtonText, { color: isDark ? '#7DD3FC' : '#0284C7' }]}>
                  👨‍🍳 Đầu Bếp (KDS)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="demo-btn-admin"
                style={[
                  styles.demoButton,
                  {
                    backgroundColor: isDark ? '#5B21B6' : '#EDE9FE',
                    borderColor: isDark ? '#A855F7' : '#7C3AED'
                  }
                ]}
                onPress={() => handleDemoLogin('ADMIN')}
                disabled={isLoading}
              >
                <Text style={[styles.demoButtonText, { color: isDark ? '#C4B5FD' : '#7C3AED' }]}>
                  👑 Quản Lý (Admin)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm
  },
  themeToggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1
  },
  themeToggleText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  keyboardContainer: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    paddingTop: spacing.sm
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg
  },
  headerEmoji: {
    fontSize: 52,
    marginBottom: spacing.xs
  },
  brandTitle: {
    fontSize: typography.sizes.display,
    fontWeight: typography.weights.extraBold,
    letterSpacing: 2
  },
  brandSubtitle: {
    fontSize: typography.sizes.sm,
    marginTop: spacing.xs,
    textAlign: 'center'
  },
  card: {
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4
  },
  cardTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    textAlign: 'center'
  },
  cardDesc: {
    fontSize: typography.sizes.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md
  },
  errorText: {
    color: '#DC2626',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  inputGroup: {
    marginBottom: spacing.md
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.sm,
    minHeight: spacing.touchTargetMobile
  },
  loginButton: {
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing.touchTargetPOS,
    marginTop: spacing.sm
  },
  buttonDisabled: {
    opacity: 0.6
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    letterSpacing: 1
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg
  },
  dividerLine: {
    flex: 1,
    height: 1
  },
  dividerText: {
    fontSize: 10,
    fontWeight: typography.weights.semibold,
    paddingHorizontal: spacing.sm
  },
  demoBar: {
    gap: spacing.sm
  },
  demoButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing.touchTargetMobile
  },
  demoButtonText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  }
});
