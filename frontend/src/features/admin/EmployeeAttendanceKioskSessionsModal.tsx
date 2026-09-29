import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react-native';
import {
  createAttendanceKioskSessionApi,
  fetchAttendanceKioskSessionsApi,
  revokeAttendanceKioskSessionApi,
  type KioskSessionDto
} from '../../api/employeeAttendance';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';

interface EmployeeAttendanceKioskSessionsModalProps {
  visible: boolean;
  branchId: number;
  onClose: () => void;
}

function sessionState(session: KioskSessionDto): string {
  if (session.revokedAt) return 'Đã thu hồi';
  if (Date.parse(session.expiresAt) <= Date.now()) return 'Đã hết hạn';
  return 'Đang hoạt động';
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'không rõ';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export const EmployeeAttendanceKioskSessionsModal: React.FC<EmployeeAttendanceKioskSessionsModalProps> = ({ visible, branchId, onClose }) => {
  const { token } = useAuth();
  const { theme } = useTheme();
  const [sessions, setSessions] = useState<KioskSessionDto[]>([]);
  const [deviceName, setDeviceName] = useState('Kiosk nhà hàng');
  const [oneTimeSecret, setOneTimeSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setSessions(await fetchAttendanceKioskSessionsApi(token, branchId)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể tải phiên kiosk.'); }
    finally { setLoading(false); }
  }, [branchId, token]);

  useEffect(() => {
    if (visible) void refresh();
    else setOneTimeSecret('');
  }, [refresh, visible]);

  const create = async () => {
    setSaving(true);
    setError('');
    setOneTimeSecret('');
    try {
      const result = await createAttendanceKioskSessionApi(token, { branchId, deviceName: deviceName.trim() || undefined, expiresInMinutes: 480 });
      setOneTimeSecret(result.secret);
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể tạo phiên kiosk.'); }
    finally { setSaving(false); }
  };

  const revoke = async (sessionId: number) => {
    setSaving(true);
    setError('');
    try {
      await revokeAttendanceKioskSessionApi(token, sessionId);
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể thu hồi phiên kiosk.'); }
    finally { setSaving(false); }
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.scrim}>
      <View style={[styles.dialog, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <View style={styles.header}>
          <View style={styles.headingGroup}>
            <ShieldCheck size={20} color={theme.primary} />
            <Text style={[styles.heading, { color: theme.textPrimary }]}>Thiết bị kiosk chấm công</Text>
          </View>
          <Pressable testID="kiosk-sessions-close" accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={styles.closeButton}>
            <X size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
        <Text style={[styles.description, { color: theme.textSecondary }]}>Phiên kiosk gắn với chi nhánh MAIN, hết hạn sau 8 giờ và có thể thu hồi từ đây.</Text>
        <View style={styles.createRow}>
          <TextInput testID="kiosk-device-name" value={deviceName} onChangeText={setDeviceName} placeholder="Tên thiết bị"
            placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <Pressable testID="kiosk-session-create" accessibilityRole="button" disabled={saving}
            onPress={() => void create()} style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: saving ? 0.55 : 1 }]}>
            <Plus size={16} color="#fff" /><Text style={styles.primaryText}>{saving ? 'Đang xử lý…' : 'Cấp phiên'}</Text>
          </Pressable>
        </View>
        {oneTimeSecret ? <View testID="kiosk-secret-panel" style={[styles.secretPanel, { backgroundColor: theme.interactiveSecondary }]}>
          <Text style={[styles.secretTitle, { color: theme.textPrimary }]}>Mã phiên chỉ hiển thị lần này. Hãy nhập mã trên thiết bị kiosk.</Text>
          <Text testID="kiosk-one-time-secret" selectable style={[styles.secret, { color: theme.primary }]}>{oneTimeSecret}</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>Mở thiết bị tại:</Text>
          <Text testID="kiosk-device-url" selectable style={[styles.url, { color: theme.textPrimary }]}>/kiosk-cham-cong</Text>
        </View> : null}
        {error ? <Text testID="kiosk-sessions-error" accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        <View style={styles.listHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Phiên đã cấp</Text>
          <Pressable testID="kiosk-sessions-refresh" accessibilityRole="button" onPress={() => void refresh()} disabled={loading || saving}>
            <RefreshCw size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
        {loading ? <ActivityIndicator color={theme.primary} /> : <ScrollView style={styles.list}>
          {sessions.length === 0 ? <Text style={[styles.description, { color: theme.textSecondary }]}>Chưa cấp phiên kiosk nào.</Text> : sessions.map(session => {
            const status = sessionState(session);
            const isActive = status === 'Đang hoạt động';
            return <View key={session.id} testID={`kiosk-session-${session.id}`} style={[styles.sessionRow, { borderTopColor: theme.borderSubtle }]}>
              <View style={styles.sessionCopy}>
                <Text style={[styles.sessionName, { color: theme.textPrimary }]}>{session.deviceName || `Thiết bị ${session.id}`}</Text>
                <Text style={[styles.description, { color: isActive ? theme.primary : theme.textSecondary }]}>{status} · Hết hạn {formatExpiry(session.expiresAt)}</Text>
              </View>
              {isActive && <Pressable testID={`kiosk-session-revoke-${session.id}`} accessibilityRole="button" disabled={saving}
                onPress={() => void revoke(session.id)} style={[styles.revokeButton, { borderColor: theme.borderSubtle }]}>
                <Trash2 size={15} color={theme.danger} /><Text style={[styles.revokeText, { color: theme.danger }]}>Thu hồi</Text>
              </Pressable>}
            </View>;
          })}
        </ScrollView>}
      </View>
    </View>
  </Modal>;
};

const styles = StyleSheet.create({
  scrim: { alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.38)', flex: 1, justifyContent: 'center', padding: spacing.md },
  dialog: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, maxHeight: '90%', maxWidth: 760, padding: spacing.lg, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headingGroup: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  heading: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.lg },
  closeButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  description: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  createRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  input: { borderRadius: radii.sm, borderWidth: 1, flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.sm, minHeight: 42, paddingHorizontal: spacing.sm },
  primaryButton: { alignItems: 'center', borderRadius: radii.sm, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 42, paddingHorizontal: spacing.md },
  primaryText: { color: '#fff', fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  secretPanel: { borderRadius: radii.sm, gap: spacing.xs, padding: spacing.md },
  secretTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  secret: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, letterSpacing: 1 },
  url: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  error: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  listHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  list: { flexGrow: 0, maxHeight: 300 },
  sessionRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', paddingVertical: spacing.sm },
  sessionCopy: { flex: 1, gap: spacing.xs },
  sessionName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  revokeButton: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 38, paddingHorizontal: spacing.sm },
  revokeText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }
});
