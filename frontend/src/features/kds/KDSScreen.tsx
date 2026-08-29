import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../theme';

export const KDSScreen: React.FC = () => {
  const { theme, isDark, toggleTheme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* KDS Header with Light/Dark Mode Switcher */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1E293B' : '#0284C7', borderBottomColor: theme.border }]}>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.title}>🍳 KDS BẾP (KITCHEN DISPLAY SYSTEM)</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#E0F2FE' }]}>
            Nhận đơn thời gian thực & cảnh báo thời gian nấu
          </Text>
        </View>

        {/* Quick KDS Theme Toggle */}
        <TouchableOpacity
          style={[
            styles.kdsThemeBtn,
            { backgroundColor: isDark ? '#334155' : '#0369A1' }
          ]}
          onPress={toggleTheme}
          accessibilityLabel="Chuyển chế độ Sáng / Tối KDS"
        >
          <Text style={styles.kdsThemeBtnText}>
            {isDark ? '☀️ Chuyển Giao diện Sáng' : '🌙 Chuyển Giao diện Tối'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.badgeContainer}>
            <Text style={[styles.badge, { backgroundColor: isDark ? '#0369A1' : '#E0F2FE', color: isDark ? '#E0F2FE' : '#0369A1' }]}>
              Mô đun M5
            </Text>
            <Text style={[styles.badge, { backgroundColor: isDark ? '#166534' : '#DCFCE7', color: isDark ? '#DCFCE7' : '#166534' }]}>
              {isDark ? '🌙 Chế độ Tối (OLED Dark)' : '☀️ Chế độ Sáng (High Contrast)'}
            </Text>
          </View>

          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Màn Hình Bếp Đa Chế Độ (Dual-Theme KDS)
          </Text>
          <Text style={[styles.cardText, { color: theme.textMuted }]}>
            Giao diện hỗ trợ cả <Text style={{ fontWeight: 'bold' }}>Dark Mode</Text> (chống lóa, dịu mắt trong bếp) và <Text style={{ fontWeight: 'bold' }}>Light Mode</Text> (rõ ràng, sắc nét trong không gian nhiều ánh sáng), đồng bộ đơn hàng tức thì qua Socket.io.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1
  },
  headerTitleGroup: {
    flex: 1
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    marginTop: spacing.xs
  },
  kdsThemeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)'
  },
  kdsThemeBtnText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center'
  },
  card: {
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  cardTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.xs,
    textAlign: 'center'
  },
  cardText: {
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    lineHeight: 22
  }
});
