import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  TouchableOpacity
} from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { MenuCategoryPills } from './MenuCategoryPills';
import { MenuItemCard } from './MenuItemCard';
import { ModifierModal } from './ModifierModal';
import { MenuItemDto } from '../../api/contracts';

export const POSScreen: React.FC = () => {
  const {
    categories,
    allMenuItems,
    filteredMenuItems,
    selectedCategoryId,
    selectCategory,
    isLoadingMenu,
    menuError,
    fetchMenu,
    selectedMenuItemForModal,
    isModifierModalOpen,
    openModifierModal,
    closeModifierModal,
    cart,
    cartItemCount,
    cartTotal,
    addToCart,
    clearCart
  } = useRestaurant();

  const formatVND = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  const handleCardPress = (item: MenuItemDto) => {
    // If item has modifier groups, open modal to configure options
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      openModifierModal(item);
    } else {
      // Add directly to cart
      addToCart(item, 1, []);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Category Filter Pills */}
      <MenuCategoryPills
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={selectCategory}
        totalItemCount={allMenuItems.length}
      />

      {/* 2. Main Menu Grid or Loading / Error States */}
      {isLoadingMenu ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải danh mục món ăn...</Text>
        </View>
      ) : menuError ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>⚠️ {menuError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMenu}>
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : filteredMenuItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Không tìm thấy món ăn trong danh mục này</Text>
        </View>
      ) : (
        <FlatList
          data={filteredMenuItems}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <MenuItemCard item={item} onPress={handleCardPress} />}
        />
      )}

      {/* 3. Bottom Cart Quick Summary Bar (Touch Target >= 56px) */}
      {cartItemCount > 0 && (
        <View style={styles.cartBar}>
          <View style={styles.cartInfo}>
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartItemCount}</Text>
            </View>
            <View>
              <Text style={styles.cartSummaryText}>Đã chọn {cartItemCount} món</Text>
              <Text style={styles.cartTotalText}>{formatVND(cartTotal)} (Đã gồm 8% VAT)</Text>
            </View>
          </View>

          <View style={styles.cartActions}>
            <TouchableOpacity style={styles.clearCartBtn} onPress={clearCart}>
              <Text style={styles.clearCartText}>Xóa</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.checkoutBtn}>
              <Text style={styles.checkoutText}>XÁC NHẬN ĐƠN ➔</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 4. Modifier Configuration Modal */}
      <ModifierModal
        visible={isModifierModalOpen}
        item={selectedMenuItemForModal}
        onClose={closeModifierModal}
        onAddToCart={addToCart}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  listContent: {
    padding: spacing.xs,
    paddingBottom: 80
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm,
    color: colors.textMuted
  },
  errorText: {
    fontSize: typography.sizes.sm,
    color: colors.danger,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.md
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted
  },
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1E293B',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    minHeight: spacing.touchTargetPOS
  },
  cartInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  cartBadge: {
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  cartSummaryText: {
    color: '#94A3B8',
    fontSize: 11
  },
  cartTotalText: {
    color: '#F8FAFC',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  cartActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  clearCartBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#334155',
    borderRadius: 6
  },
  clearCartText: {
    color: '#CBD5E1',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  checkoutBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkoutText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs,
    letterSpacing: 0.5
  }
});
