import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { CategoryDto } from '../../api/contracts';
import { colors, typography, spacing } from '../../theme';

interface Props {
  categories: CategoryDto[];
  selectedCategoryId: number | null;
  onSelectCategory: (id: number | null) => void;
  totalItemCount: number;
}

export const MenuCategoryPills: React.FC<Props> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
  totalItemCount
}) => {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* All Items Pill */}
        <TouchableOpacity
          style={[styles.pill, selectedCategoryId === null && styles.pillActive]}
          onPress={() => onSelectCategory(null)}
        >
          <Text style={[styles.pillText, selectedCategoryId === null && styles.pillTextActive]}>
            🍗 Tất cả ({totalItemCount})
          </Text>
        </TouchableOpacity>

        {/* Categories Pills */}
        {categories.map((cat) => {
          const isActive = selectedCategoryId === cat.id;
          const count = cat.menuItems?.length || 0;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => onSelectCategory(cat.id)}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                {cat.name} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm
  },
  pill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: spacing.touchTargetMobile
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  pillText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.text
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold
  }
});
