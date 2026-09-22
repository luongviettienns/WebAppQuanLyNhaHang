import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AppIcon } from '../../ui';
import { radii, spacing, typography } from '../../theme';

export function SupplierModalShell({ visible, title, onClose, busy = false, children, footer }: {
  visible: boolean; title: string; onClose: () => void; busy?: boolean; children: React.ReactNode; footer: React.ReactNode;
}) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <View accessibilityViewIsModal style={[styles.panel, { width: Math.min(width - (width < 600 ? 16 : 48), 1080), maxHeight: height - 32, backgroundColor: theme.surfaceBase }]}>
        <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" disabled={busy} onPress={onClose} style={styles.close}><AppIcon icon={X} color={theme.textSecondary} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>{children}</ScrollView>
        <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>{footer}</View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.45)' },
  panel: { borderRadius: radii.lg, overflow: 'hidden', flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  title: { fontFamily: typography.families.bodySemibold, fontSize: 20, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.lg, gap: spacing.lg },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1 }
});
