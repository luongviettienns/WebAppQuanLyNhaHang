import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { MenuItemDto } from '../../api/contracts';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../theme';

interface Props {
  item: MenuItemDto;
  onPress: (item: MenuItemDto) => void;
}

export const MenuItemCard: React.FC<Props> = ({ item, onPress }) => {
  const { theme, isDark } = useTheme();

  const formattedPrice = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(item.basePrice);

  const hasModifiers = item.modifierGroups && item.modifierGroups.length > 0;
  const isAvailable = item.isAvailable;

  const getItemEmoji = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('combo')) return '🎁';
    if (lower.includes('gà') || lower.includes('canh') || lower.includes('dui')) return '🍗';
    if (lower.includes('burger')) return '🍔';
    if (lower.includes('khoai')) return '🍟';
    if (lower.includes('cơm')) return '🍚';
    if (lower.includes('mì')) return '🍝';
    if (lower.includes('pepsi') || lower.includes('nước') || lower.includes('trà')) return '🥤';
    if (lower.includes('kem') || lower.includes('bánh')) return '🍦';
    return '🍽️';
  };

  return (
    <TouchableOpacity
      testID={`menu-item-${item.id}`}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
        !isAvailable && (isDark ? styles.cardDisabledDark : styles.cardDisabledLight)
      ]}
      onPress={() => isAvailable && onPress(item)}
      activeOpacity={isAvailable ? 0.7 : 1}
      disabled={!isAvailable}
    >
      {/* Icon / Image Placeholder */}
      <View style={[styles.imageBox, { backgroundColor: isDark ? '#334155' : '#FFF7ED' }]}>
        <Text style={styles.emoji}>{getItemEmoji(item.name)}</Text>
        {!isAvailable && (
          <View style={styles.soldOutOverlay}>
            <Text style={styles.soldOutText}>HẾT HÀNG (86&apos;d)</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
          {item.name}
        </Text>

        {item.description && (
          <Text style={[styles.desc, { color: theme.textMuted }]} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={[styles.price, { color: theme.primary }]}>{formattedPrice}</Text>

          {hasModifiers && isAvailable && (
            <View style={[styles.modifierBadge, { backgroundColor: isDark ? '#7C2D12' : '#FFEDD5' }]}>
              <Text style={[styles.modifierBadgeText, { color: isDark ? '#FDBA74' : theme.secondary }]}>
                Tùy chọn
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    flex: 1,
    margin: spacing.xs,
    minHeight: 180
  },
  cardDisabledLight: {
    opacity: 0.55,
    backgroundColor: '#F8FAFC'
  },
  cardDisabledDark: {
    opacity: 0.45,
    backgroundColor: '#0F172A'
  },
  imageBox: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  emoji: {
    fontSize: 42
  },
  soldOutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  soldOutText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 1
  },
  info: {
    padding: spacing.sm,
    flex: 1,
    justifyContent: 'space-between'
  },
  name: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  desc: {
    fontSize: 11,
    marginTop: 2
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs
  },
  price: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.extraBold
  },
  modifierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  modifierBadgeText: {
    fontSize: 10,
    fontWeight: typography.weights.bold
  }
});
