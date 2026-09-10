import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CategoryDto } from '../../api/contracts';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';

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
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: theme.borderSubtle }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedCategoryId === null }}
          style={({ pressed }) => [
            styles.pill,
            { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle },
            selectedCategoryId === null && { backgroundColor: theme.interactivePrimary, borderColor: theme.interactivePrimary }
          ]}
          onPress={() => onSelectCategory(null)}
        >
          <Text
            style={[
              styles.pillText,
              { color: selectedCategoryId === null ? theme.textInverse : theme.textPrimary },
              selectedCategoryId === null && styles.pillTextActive
            ]}
          >
            Tất cả ({totalItemCount})
          </Text>
        </Pressable>

        {/* Categories Pills */}
        {categories.map((cat) => {
          const isActive = selectedCategoryId === cat.id;
          const count = cat.menuItems?.length || 0;
          return (
            <Pressable
              key={cat.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.pill,
                { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle },
                isActive && { backgroundColor: theme.interactivePrimary, borderColor: theme.interactivePrimary }
              ]}
              onPress={() => onSelectCategory(cat.id)}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: isActive ? theme.textInverse : theme.textPrimary },
                  isActive && styles.pillTextActive
                ]}
              >
                {cat.name} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: spacing.touchTargetMobile
  },
  pillText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  pillTextActive: {
    fontFamily: typography.families.bodyBold
  }
});
