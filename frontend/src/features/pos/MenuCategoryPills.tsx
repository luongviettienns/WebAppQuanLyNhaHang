import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { CategoryDto } from '../../api/contracts';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../theme';

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
  const { theme, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* All Items Pill */}
        <TouchableOpacity
          style={[
            styles.pill,
            { backgroundColor: isDark ? '#334155' : '#F1F5F9', borderColor: theme.border },
            selectedCategoryId === null && { backgroundColor: theme.primary, borderColor: theme.primary }
          ]}
          onPress={() => onSelectCategory(null)}
        >
          <Text
            style={[
              styles.pillText,
              { color: selectedCategoryId === null ? '#FFFFFF' : theme.text },
              selectedCategoryId === null && styles.pillTextActive
            ]}
          >
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
              style={[
                styles.pill,
                { backgroundColor: isDark ? '#334155' : '#F1F5F9', borderColor: theme.border },
                isActive && { backgroundColor: theme.primary, borderColor: theme.primary }
              ]}
              onPress={() => onSelectCategory(cat.id)}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: isActive ? '#FFFFFF' : theme.text },
                  isActive && styles.pillTextActive
                ]}
              >
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
    borderBottomWidth: 1,
    paddingVertical: spacing.sm
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: spacing.touchTargetMobile
  },
  pillText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  pillTextActive: {
    fontWeight: typography.weights.bold
  }
});
