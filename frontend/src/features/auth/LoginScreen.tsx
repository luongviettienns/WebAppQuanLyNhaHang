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
import { colors, typography, spacing } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { Role } from '../../api/contracts';

export const LoginScreen: React.FC = () => {
  const { login, demoLogin, isLoading } = useAuth();
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
    await demoLogin(role);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Brand Header */}
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>🍔</Text>
            <Text style={styles.brandTitle}>CRISPY BITE</Text>
            <Text style={styles.brandSubtitle}>Hệ Thống Đặt Món & Quản Lý Nhà Hàng QSR</Text>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Đăng Nhập Hệ Thống</Text>
            <Text style={styles.cardDesc}>Vui lòng nhập tài khoản được cấp để tiếp tục</Text>

            {errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tên đăng nhập</Text>
              <TextInput
                style={styles.input}
                placeholder="Nhập tên đăng nhập (cashier, kitchen, admin)..."
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mật khẩu</Text>
              <TextInput
                style={styles.input}
                placeholder="Nhập mật khẩu..."
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!isLoading}
              />
            </View>

            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.buttonDisabled]}
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
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>HOẶC ĐĂNG NHẬP NHANH (DEMO BAR)</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Quick Demo Login Bar */}
            <View style={styles.demoBar}>
              <TouchableOpacity
                style={[styles.demoButton, { backgroundColor: '#FFEDD5', borderColor: colors.secondary }]}
                onPress={() => handleDemoLogin('CASHIER')}
                disabled={isLoading}
              >
                <Text style={[styles.demoButtonText, { color: colors.secondary }]}>👤 Thu Ngân (Cashier)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.demoButton, { backgroundColor: '#F1F5F9', borderColor: '#475569' }]}
                onPress={() => handleDemoLogin('KITCHEN')}
                disabled={isLoading}
              >
                <Text style={[styles.demoButtonText, { color: '#334155' }]}>👨‍🍳 Đầu Bếp (KDS)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.demoButton, { backgroundColor: '#FEE2E2', borderColor: colors.primary }]}
                onPress={() => handleDemoLogin('ADMIN')}
                disabled={isLoading}
              >
                <Text style={[styles.demoButtonText, { color: colors.primary }]}>👑 Quản Lý (Admin)</Text>
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
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl
  },
  headerEmoji: {
    fontSize: 56,
    marginBottom: spacing.xs
  },
  brandTitle: {
    fontSize: typography.sizes.display,
    fontWeight: typography.weights.extraBold,
    color: colors.primary,
    letterSpacing: 2
  },
  brandSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center'
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4
  },
  cardTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center'
  },
  cardDesc: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
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
    color: colors.text,
    marginBottom: spacing.xs
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.sm,
    color: colors.text,
    minHeight: spacing.touchTargetMobile
  },
  loginButton: {
    backgroundColor: colors.primary,
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
    height: 1,
    backgroundColor: colors.border
  },
  dividerText: {
    fontSize: 10,
    color: colors.textMuted,
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
