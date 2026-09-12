import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SlidersHorizontal, UtensilsCrossed } from 'lucide-react-native';
import { MenuItemDto } from '../../api/contracts';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, StatusBadge } from '../../ui';

interface Props {
  item: MenuItemDto;
  onPress: (item: MenuItemDto) => void;
}

export const MenuItemCard: React.FC<Props> = ({ item, onPress }) => {
  const { theme } = useTheme();
  const formattedPrice = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(item.basePrice);
  const hasModifiers = Boolean(item.modifierGroups?.length);

  return (
    <Pressable
      testID={`menu-item-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formattedPrice}${item.isAvailable ? '' : ', hết hàng'}`}
      accessibilityState={{ disabled: !item.isAvailable }}
      disabled={!item.isAvailable}
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase,
          borderColor: item.isAvailable ? theme.borderSubtle : theme.borderStrong
        },
        !item.isAvailable && styles.disabled
      ]}
    >
      <View style={[styles.media, { backgroundColor: theme.surfaceSunken }]}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={{ height: '100%', width: '100%' }} resizeMode="cover" />
        ) : (
          <AppIcon icon={UtensilsCrossed} color={theme.textSecondary} size={28} />
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.copy}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>{item.name}</Text>
          {item.description && <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>{item.description}</Text>}
        </View>

        <View style={styles.footer}>
          <Text style={[styles.price, { color: theme.primary }]}>{formattedPrice}</Text>
          {!item.isAvailable ? (
            <StatusBadge tone="danger" label="Hết hàng" />
          ) : hasModifiers ? (
            <StatusBadge tone="neutral" label="Tùy chọn" icon={SlidersHorizontal} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: radii.md, borderWidth: 1, flex: 1, marginBottom: spacing.md, minHeight: 164, overflow: 'hidden' },
  disabled: { opacity: 0.55 },
  media: { alignItems: 'center', height: 64, justifyContent: 'center' },
  content: { flex: 1, gap: spacing.md, justifyContent: 'space-between', padding: spacing.md },
  copy: { gap: spacing.xs },
  name: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md },
  description: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  footer: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  price: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, fontVariant: [...typography.numeric.fontVariant] }
});
