import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions
} from 'react-native';
import {
  Wifi,
  Radio,
  Server,
  RefreshCw,
  X,
  Check
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { radii, spacing, typography } from '../theme';
import { AppIcon, Button, Field, InlineAlert, Surface } from '../ui';
import {
  getApiBaseUrl,
  setCustomServerHost,
  pingServer,
  fetchServerNetworkInfo
} from '../api/config';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({ visible, onClose }) => {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [currentUrl, setCurrentUrl] = useState<string>(getApiBaseUrl());
  const [customIpInput, setCustomIpInput] = useState<string>('');
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; latencyMs?: number; message?: string } | null>(null);
  const [networkAddresses, setNetworkAddresses] = useState<Array<{ name: string; ip: string; webUrl: string; apiUrl: string }>>([]);
  const [isLoadingNetworks, setIsLoadingNetworks] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      const active = getApiBaseUrl();
      setCurrentUrl(active);
      setCustomIpInput('');
      setPingResult(null);
      handlePing(active);
      loadNetworkInfo();
    }
  }, [visible]);

  const loadNetworkInfo = async () => {
    setIsLoadingNetworks(true);
    try {
      const list = await fetchServerNetworkInfo();
      setNetworkAddresses(list);
    } catch {
      setNetworkAddresses([]);
    } finally {
      setIsLoadingNetworks(false);
    }
  };

  const handlePing = async (urlToCheck?: string) => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const result = await pingServer(urlToCheck || currentUrl);
      setPingResult(result);
    } finally {
      setIsPinging(false);
    }
  };

  const handleApplyIp = async (targetHost: string | null) => {
    await setCustomServerHost(targetHost);
    const updated = getApiBaseUrl();
    setCurrentUrl(updated);
    setCustomIpInput('');
    await handlePing(updated);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Surface
          level="raised"
          style={[styles.container, isDesktop ? styles.containerDesktop : styles.containerMobile]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconBadge, { backgroundColor: theme.surfaceSunken }]}>
                <AppIcon icon={Wifi} size={20} color={theme.interactivePrimary} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.textPrimary }]}>
                  Kết nối Máy chủ (Wi-Fi)
                </Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Tự động nhận diện mạng LAN khi đổi Wi-Fi
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng modal"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: pressed ? theme.surfaceSunken : 'transparent' }
              ]}
            >
              <AppIcon icon={X} size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Status Card */}
            <View
              style={[
                styles.statusCard,
                {
                  backgroundColor: isDark ? theme.surfaceSunken : theme.surfaceBase,
                  borderColor: pingResult?.ok ? theme.success : pingResult ? theme.danger : theme.borderSubtle
                }
              ]}
            >
              <View style={styles.statusHeader}>
                <View style={styles.statusIndicatorRow}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: pingResult?.ok
                          ? theme.success
                          : pingResult
                          ? theme.danger
                          : theme.warning
                      }
                    ]}
                  />
                  <Text style={[styles.statusLabel, { color: theme.textPrimary }]}>
                    {isPinging
                      ? 'Đang kiểm tra kết nối...'
                      : pingResult?.ok
                      ? `🟢 Đã kết nối máy chủ (${pingResult.latencyMs}ms)`
                      : pingResult
                      ? '🔴 Không thể kết nối'
                      : '🟡 Chưa kiểm tra'}
                  </Text>
                </View>
                <View style={{ minWidth: 90 }}>
                  <Button
                    label={isPinging ? '...' : 'Kiểm tra'}
                    icon={RefreshCw}
                    variant="secondary"
                    onPress={() => void handlePing(currentUrl)}
                    disabled={isPinging}
                  />
                </View>
              </View>

              <Text style={[styles.urlText, { color: theme.textSecondary }]}>
                Đang gọi tới: <Text style={{ color: theme.interactivePrimary, fontWeight: '700' }}>{currentUrl}</Text>
              </Text>

              {pingResult && !pingResult.ok && (
                <View style={{ marginTop: spacing.sm }}>
                  <InlineAlert
                    tone="danger"
                    title="Mất kết nối máy chủ"
                    message="Vui lòng kiểm tra: Máy tính và điện thoại đã kết nối cùng 1 mạng Wi-Fi chưa."
                  />
                </View>
              )}
            </View>

            {/* Network Interfaces Detected */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                  Các địa chỉ Wi-Fi máy chủ phát hiện
                </Text>
                <Pressable
                  onPress={() => void loadNetworkInfo()}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, flexDirection: 'row', alignItems: 'center' }]}
                >
                  <AppIcon icon={RefreshCw} size={14} color={theme.interactivePrimary} />
                  <Text style={{ marginLeft: 4, fontSize: typography.sizes.sm, color: theme.interactivePrimary }}>
                    Quét lại
                  </Text>
                </Pressable>
              </View>

              {isLoadingNetworks ? (
                <ActivityIndicator size="small" color={theme.interactivePrimary} style={{ marginVertical: spacing.md }} />
              ) : networkAddresses.length > 0 ? (
                networkAddresses.map((net, idx) => {
                  const isMatch = currentUrl.includes(net.ip);
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => void handleApplyIp(net.ip)}
                      style={({ pressed }) => [
                        styles.networkItem,
                        {
                          backgroundColor: isMatch
                            ? (isDark ? theme.surfaceBase : theme.interactiveQuiet)
                            : (isDark ? theme.surfaceSunken : theme.surfaceBase),
                          borderColor: isMatch ? theme.interactivePrimary : theme.borderSubtle,
                          opacity: pressed ? 0.8 : 1
                        }
                      ]}
                    >
                      <View style={styles.networkLeft}>
                        <AppIcon
                          icon={net.name.toLowerCase().includes('wi-fi') ? Wifi : Server}
                          size={18}
                          color={isMatch ? theme.interactivePrimary : theme.textSecondary}
                        />
                        <View style={{ marginLeft: spacing.sm }}>
                          <Text style={[styles.networkName, { color: theme.textPrimary }]}>
                            {net.name} ({net.ip})
                          </Text>
                          <Text style={[styles.networkUrl, { color: theme.textSecondary }]}>
                            Mở trên điện thoại: {net.webUrl}
                          </Text>
                        </View>
                      </View>
                      {isMatch ? (
                        <View style={[styles.badgeActive, { backgroundColor: theme.interactivePrimary }]}>
                          <AppIcon icon={Check} size={14} color={theme.textInverse} />
                        </View>
                      ) : (
                        <Text style={{ fontSize: typography.sizes.xs, color: theme.interactivePrimary, fontWeight: '600' }}>
                          Chọn IP này
                        </Text>
                      )}
                    </Pressable>
                  );
                })
              ) : (
                <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
                  Không thể lấy danh sách card mạng. Bạn có thể tự nhập IP ở bên dưới.
                </Text>
              )}
            </View>

            {/* Quick Actions */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Tùy chọn cấu hình nhanh
              </Text>
              <View style={styles.actionRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Tự động nhận diện"
                    variant="primary"
                    icon={Radio}
                    onPress={() => void handleApplyIp(null)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Localhost (Chỉ máy này)"
                    variant="secondary"
                    onPress={() => void handleApplyIp('localhost')}
                  />
                </View>
              </View>
            </View>

            {/* Manual IP input */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Nhập IP máy chủ thủ công
              </Text>
              <Field
                label="Địa chỉ IP hoặc URL máy chủ"
                placeholder="Ví dụ: 192.168.1.15 hoặc 172.16.18.80"
                value={customIpInput}
                onChangeText={setCustomIpInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={{ marginTop: spacing.xs }}>
                <Button
                  label="Áp dụng IP này"
                  variant="secondary"
                  disabled={!customIpInput.trim()}
                  onPress={() => void handleApplyIp(customIpInput.trim())}
                />
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
            <Text style={[styles.footerNote, { color: theme.textSecondary }]}>
              {'💡 Mẹo: Khi đổi Wi-Fi, chỉ cần mở màn hình này và bấm "Tự động nhận diện".'}
            </Text>
            <View style={{ minWidth: 80 }}>
              <Button label="Đóng" variant="primary" onPress={onClose} />
            </View>
          </View>
        </Surface>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md
  },
  container: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    maxHeight: '90%',
    width: '100%'
  },
  containerDesktop: {
    maxWidth: 620
  },
  containerMobile: {
    maxWidth: '100%'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center'
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: '700'
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center'
  },
  body: {
    flexGrow: 1
  },
  bodyContent: {
    padding: spacing.lg,
    gap: spacing.lg
  },
  statusCard: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    padding: spacing.md
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  statusLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '700'
  },
  urlText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.families.body
  },
  section: {
    gap: spacing.xs
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700'
  },
  networkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    marginTop: spacing.xs
  },
  networkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  networkName: {
    fontSize: typography.sizes.sm,
    fontWeight: '600'
  },
  networkUrl: {
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  badgeActive: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyHint: {
    fontSize: typography.sizes.xs,
    fontStyle: 'italic',
    paddingVertical: spacing.xs
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1
  },
  footerNote: {
    fontSize: typography.sizes.xs,
    flex: 1,
    marginRight: spacing.md
  }
});
