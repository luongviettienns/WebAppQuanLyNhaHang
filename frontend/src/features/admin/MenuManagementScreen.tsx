import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  Switch
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { MenuItemDto, MenuItemUpsertDto } from '../../api/contracts';
import { typography, spacing } from '../../theme';

interface ModifierOptionForm {
  id?: number;
  name: string;
  priceDeltaStr: string;
}

interface ModifierGroupForm {
  id?: number;
  name: string;
  isRequired: boolean;
  minSelectStr: string;
  maxSelectStr: string;
  options: ModifierOptionForm[];
}

interface MenuItemForm {
  id?: number;
  name: string;
  categoryId: number;
  basePriceStr: string;
  description: string;
  imageUrl: string;
  isAvailable: boolean;
  modifierGroups: ModifierGroupForm[];
}

export const MenuManagementScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const {
    categories,
    allMenuItems,
    toggleMenuItemSoldOut,
    createMenuItem,
    updateMenuItem,
    isLoadingMenu
  } = useRestaurant();

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MenuItemDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);

  // Form State
  const [form, setForm] = useState<MenuItemForm>({
    name: '',
    categoryId: categories[0]?.id || 1,
    basePriceStr: '',
    description: '',
    imageUrl: '',
    isAvailable: true,
    modifierGroups: []
  });

  // Filter items by category & search query
  const filteredItems = useMemo(() => {
    let items = allMenuItems;
    if (selectedCategoryId !== null) {
      items = items.filter((item) => item.categoryId === selectedCategoryId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return items;
  }, [allMenuItems, selectedCategoryId, searchQuery]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormError(null);
    setForm({
      name: '',
      categoryId: selectedCategoryId ?? (categories[0]?.id || 1),
      basePriceStr: '',
      description: '',
      imageUrl: '',
      isAvailable: true,
      modifierGroups: []
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: MenuItemDto) => {
    setEditingItem(item);
    setFormError(null);
    setForm({
      id: item.id,
      name: item.name,
      categoryId: item.categoryId,
      basePriceStr: item.basePrice.toString(),
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      isAvailable: item.isAvailable,
      modifierGroups: (item.modifierGroups || []).map((group) => ({
        id: group.id,
        name: group.name,
        isRequired: group.isRequired,
        minSelectStr: group.minSelect.toString(),
        maxSelectStr: group.maxSelect.toString(),
        options: group.options.map((opt) => ({
          id: opt.id,
          name: opt.name,
          priceDeltaStr: opt.priceDelta.toString()
        }))
      }))
    });
    setIsModalOpen(true);
  };

  const handleToggleSoldOut = async (item: MenuItemDto) => {
    setTogglingItemId(item.id);
    const nextState = !item.isAvailable;
    const res = await toggleMenuItemSoldOut(item.id, nextState);
    setTogglingItemId(null);
    if (!res.success) {
      Alert.alert('Lỗi cập nhật', res.error || 'Không thể đổi trạng thái món ăn');
    }
  };

  // Modifier Group Handlers in Form
  const addModifierGroup = () => {
    setForm((prev) => ({
      ...prev,
      modifierGroups: [
        ...prev.modifierGroups,
        {
          name: '',
          isRequired: false,
          minSelectStr: '0',
          maxSelectStr: '1',
          options: [{ name: '', priceDeltaStr: '0' }]
        }
      ]
    }));
  };

  const removeModifierGroup = (groupIndex: number) => {
    setForm((prev) => ({
      ...prev,
      modifierGroups: prev.modifierGroups.filter((_, idx) => idx !== groupIndex)
    }));
  };

  const updateModifierGroup = (
    groupIndex: number,
    field: keyof ModifierGroupForm,
    value: any
  ) => {
    setForm((prev) => {
      const updated = [...prev.modifierGroups];
      updated[groupIndex] = { ...updated[groupIndex], [field]: value };
      return { ...prev, modifierGroups: updated };
    });
  };

  const addOptionToGroup = (groupIndex: number) => {
    setForm((prev) => {
      const updated = [...prev.modifierGroups];
      updated[groupIndex] = {
        ...updated[groupIndex],
        options: [...updated[groupIndex].options, { name: '', priceDeltaStr: '0' }]
      };
      return { ...prev, modifierGroups: updated };
    });
  };

  const removeOptionFromGroup = (groupIndex: number, optionIndex: number) => {
    setForm((prev) => {
      const updated = [...prev.modifierGroups];
      updated[groupIndex] = {
        ...updated[groupIndex],
        options: updated[groupIndex].options.filter((_, idx) => idx !== optionIndex)
      };
      return { ...prev, modifierGroups: updated };
    });
  };

  const updateOptionInGroup = (
    groupIndex: number,
    optionIndex: number,
    field: keyof ModifierOptionForm,
    value: string
  ) => {
    setForm((prev) => {
      const updated = [...prev.modifierGroups];
      const updatedOptions = [...updated[groupIndex].options];
      updatedOptions[optionIndex] = { ...updatedOptions[optionIndex], [field]: value };
      updated[groupIndex] = { ...updated[groupIndex], options: updatedOptions };
      return { ...prev, modifierGroups: updated };
    });
  };

  const handleSubmitForm = async () => {
    setFormError(null);

    // Validation
    const name = form.name.trim();
    if (!name) {
      setFormError('Tên món ăn không được để trống.');
      return;
    }

    const basePrice = parseInt(form.basePriceStr, 10);
    if (isNaN(basePrice) || basePrice <= 0) {
      setFormError('Giá cơ bản phải là số nguyên lớn hơn 0 (VND).');
      return;
    }

    if (!form.categoryId) {
      setFormError('Vui lòng chọn danh mục cho món ăn.');
      return;
    }

    // Validate modifier groups
    for (let i = 0; i < form.modifierGroups.length; i++) {
      const group = form.modifierGroups[i];
      if (!group.name.trim()) {
        setFormError(`Nhóm tùy chọn #${i + 1} thiếu tên nhóm.`);
        return;
      }
      const minSelect = parseInt(group.minSelectStr, 10);
      const maxSelect = parseInt(group.maxSelectStr, 10);
      if (isNaN(minSelect) || minSelect < 0) {
        setFormError(`Nhóm "${group.name}": Tối thiểu (minSelect) phải là số nguyên >= 0.`);
        return;
      }
      if (isNaN(maxSelect) || maxSelect < 1) {
        setFormError(`Nhóm "${group.name}": Tối đa (maxSelect) phải là số nguyên >= 1.`);
        return;
      }
      if (minSelect > maxSelect) {
        setFormError(`Nhóm "${group.name}": Tối thiểu (${minSelect}) không được lớn hơn Tối đa (${maxSelect}).`);
        return;
      }
      if (group.options.length < maxSelect) {
        setFormError(
          `Nhóm "${group.name}": Có ${group.options.length} lựa chọn, nhưng Tối đa cho phép chọn ${maxSelect}. Số lượng lựa chọn phải >= Tối đa.`
        );
        return;
      }
      for (let j = 0; j < group.options.length; j++) {
        const opt = group.options[j];
        if (!opt.name.trim()) {
          setFormError(`Nhóm "${group.name}" - Lựa chọn #${j + 1} thiếu tên.`);
          return;
        }
        const delta = parseInt(opt.priceDeltaStr || '0', 10);
        if (isNaN(delta) || delta < 0) {
          setFormError(`Nhóm "${group.name}" - Lựa chọn "${opt.name}": Phụ phí phải là số nguyên >= 0.`);
          return;
        }
      }
    }

    const payload: MenuItemUpsertDto = {
      categoryId: form.categoryId,
      name,
      basePrice,
      description: form.description.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      isAvailable: form.isAvailable,
      modifierGroups: form.modifierGroups.map((g) => ({
        name: g.name.trim(),
        isRequired: g.isRequired,
        minSelect: parseInt(g.minSelectStr, 10),
        maxSelect: parseInt(g.maxSelectStr, 10),
        options: g.options.map((opt) => ({
          name: opt.name.trim(),
          priceDelta: parseInt(opt.priceDeltaStr || '0', 10),
          isAvailable: true
        }))
      }))
    };

    setIsSubmitting(true);
    let res;
    if (editingItem) {
      res = await updateMenuItem(editingItem.id, payload);
    } else {
      res = await createMenuItem(payload);
    }
    setIsSubmitting(false);

    if (res.success) {
      setIsModalOpen(false);
      Alert.alert('Thành công', editingItem ? 'Đã cập nhật món ăn!' : 'Đã thêm món ăn mới!');
    } else {
      setFormError(res.error || 'Có lỗi xảy ra khi lưu món ăn.');
    }
  };

  const getCategoryName = (catId: number) => {
    return categories.find((c) => c.id === catId)?.name || 'Khác';
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Sub Header / Action Bar */}
      <View style={[styles.actionBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.actionBarLeft}>
          <Text style={[styles.screenTitle, { color: theme.text }]}>Quản Lý Thực Đơn</Text>
          <Text style={[styles.screenSubtitle, { color: theme.textMuted }]}>
            {filteredItems.length} món • Phân quyền Admin
          </Text>
        </View>

        <TouchableOpacity
          testID="admin-btn-add-item"
          style={[styles.createBtn, { backgroundColor: theme.primary }]}
          onPress={openCreateModal}
          accessibilityLabel="Thêm món ăn mới"
        >
          <Text style={styles.createBtnText}>➕ Thêm Món Mới</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar & Category Filter Pills */}
      <View style={[styles.filterSection, { borderBottomColor: theme.border }]}>
        <View style={[styles.searchBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: theme.border }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Tìm theo tên món hoặc mô tả..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={[styles.clearSearch, { color: theme.textMuted }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
          <TouchableOpacity
            style={[
              styles.pill,
              selectedCategoryId === null
                ? { backgroundColor: theme.primary }
                : { backgroundColor: isDark ? '#334155' : '#E2E8F0' }
            ]}
            onPress={() => setSelectedCategoryId(null)}
          >
            <Text
              style={[
                styles.pillText,
                selectedCategoryId === null
                  ? { color: '#FFFFFF', fontWeight: typography.weights.bold }
                  : { color: theme.text }
              ]}
            >
              Tất cả ({allMenuItems.length})
            </Text>
          </TouchableOpacity>

          {categories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            const itemCount = allMenuItems.filter((i) => i.categoryId === cat.id).length;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.pill,
                  isSelected
                    ? { backgroundColor: theme.primary }
                    : { backgroundColor: isDark ? '#334155' : '#E2E8F0' }
                ]}
                onPress={() => setSelectedCategoryId(cat.id)}
              >
                <Text
                  style={[
                    styles.pillText,
                    isSelected
                      ? { color: '#FFFFFF', fontWeight: typography.weights.bold }
                      : { color: theme.text }
                  ]}
                >
                  {cat.name} ({itemCount})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Menu Item Cards List */}
      {isLoadingMenu ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Đang tải thực đơn...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🍽️</Text>
          <Text style={[styles.emptyText, { color: theme.text }]}>Không tìm thấy món ăn nào</Text>
          <Text style={[styles.emptySubtext, { color: theme.textMuted }]}>
            Hãy thử tìm kiếm với từ khóa khác hoặc nhấn &quot;➕ Thêm Món Mới&quot;
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.itemsList}>
          {filteredItems.map((item) => {
            const isToggling = togglingItemId === item.id;
            const modGroupCount = item.modifierGroups?.length || 0;

            return (
              <View
                key={item.id}
                style={[
                  styles.itemCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  !item.isAvailable && styles.itemCardDisabled
                ]}
              >
                {/* Left Thumbnail or Icon */}
                <View style={styles.thumbnailContainer}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} resizeMode="cover" />
                  ) : (
                    <View style={[styles.fallbackThumbnail, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                      <Text style={styles.fallbackIcon}>🍔</Text>
                    </View>
                  )}
                  {!item.isAvailable && (
                    <View style={styles.soldOutBadgeOverlay}>
                      <Text style={styles.soldOutBadgeText}>86&apos;d</Text>
                    </View>
                  )}
                </View>

                {/* Middle Info */}
                <View style={styles.itemInfo}>
                  <View style={styles.itemTitleRow}>
                    <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={[styles.categoryTag, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]}>
                      <Text style={[styles.categoryTagText, { color: theme.textMuted }]}>
                        {getCategoryName(item.categoryId)}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.itemPrice, { color: theme.primary }]}>
                    {item.basePrice.toLocaleString('vi-VN')} đ
                  </Text>

                  {item.description ? (
                    <Text style={[styles.itemDesc, { color: theme.textMuted }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}

                  {modGroupCount > 0 && (
                    <View style={styles.modifierBadgesRow}>
                      <Text style={[styles.modBadge, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5', color: isDark ? '#6EE7B7' : '#065F46' }]}>
                        ⚙️ {modGroupCount} nhóm tùy chọn
                      </Text>
                    </View>
                  )}
                </View>

                {/* Right Actions: Sold-Out Switch & Edit Button */}
                <View style={styles.itemActions}>
                  <View style={styles.switchWrapper}>
                    <Text style={[styles.switchLabel, { color: item.isAvailable ? '#10B981' : '#EF4444' }]}>
                      {item.isAvailable ? 'Còn hàng' : 'Hết món'}
                    </Text>
                    {isToggling ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <Switch
                        testID={`menu-item-switch-${item.id}`}
                        value={item.isAvailable}
                        onValueChange={() => handleToggleSoldOut(item)}
                        trackColor={{ false: '#EF4444', true: '#10B981' }}
                        thumbColor="#FFFFFF"
                      />
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.editBtn, { backgroundColor: isDark ? '#334155' : '#EEF2FF', borderColor: isDark ? '#475569' : '#C7D2FE' }]}
                    onPress={() => openEditModal(item)}
                    accessibilityLabel={`Chỉnh sửa món ${item.name}`}
                  >
                    <Text style={[styles.editBtnText, { color: isDark ? '#818CF8' : '#4F46E5' }]}>✏️ Sửa</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Upsert Modal (Create / Edit Menu Item) */}
      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingItem ? `✏️ Chỉnh Sửa: ${editingItem.name}` : '➕ Thêm Món Ăn Mới'}
              </Text>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} style={styles.closeBtn}>
                <Text style={[styles.closeBtnText, { color: theme.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Error banner */}
            {formError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>⚠️ {formError}</Text>
              </View>
            )}

            {/* Modal Body Form */}
            <ScrollView contentContainerStyle={styles.modalBody}>
              {/* Tên món */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: theme.text }]}>
                  Tên món ăn <Text style={styles.requiredMark}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: theme.text, borderColor: theme.border }]}
                  placeholder="VD: Burger Bò Phô Mai Đặc Biệt"
                  placeholderTextColor={theme.textMuted}
                  value={form.name}
                  onChangeText={(val) => setForm((prev) => ({ ...prev, name: val }))}
                />
              </View>

              {/* Danh mục */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: theme.text }]}>
                  Danh mục <Text style={styles.requiredMark}>*</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catSelectRow}>
                  {categories.map((cat) => {
                    const isSelected = form.categoryId === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.catSelectPill,
                          isSelected
                            ? { backgroundColor: theme.primary, borderColor: theme.primary }
                            : { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: theme.border }
                        ]}
                        onPress={() => setForm((prev) => ({ ...prev, categoryId: cat.id }))}
                      >
                        <Text
                          style={[
                            styles.catSelectText,
                            isSelected ? { color: '#FFFFFF', fontWeight: typography.weights.bold } : { color: theme.text }
                          ]}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Giá cơ bản & Trạng thái còn hàng */}
              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1, marginRight: spacing.md }]}>
                  <Text style={[styles.label, { color: theme.text }]}>
                    Giá cơ bản (VND) <Text style={styles.requiredMark}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: theme.text, borderColor: theme.border }]}
                    placeholder="VD: 65000"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="numeric"
                    value={form.basePriceStr}
                    onChangeText={(val) => setForm((prev) => ({ ...prev, basePriceStr: val.replace(/[^0-9]/g, '') }))}
                  />
                </View>

                <View style={[styles.formGroup, { width: 120 }]}>
                  <Text style={[styles.label, { color: theme.text }]}>Trạng thái</Text>
                  <View style={styles.switchRowInline}>
                    <Switch
                      value={form.isAvailable}
                      onValueChange={(val) => setForm((prev) => ({ ...prev, isAvailable: val }))}
                      trackColor={{ false: '#EF4444', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                    <Text style={[styles.switchStatusText, { color: form.isAvailable ? '#10B981' : '#EF4444' }]}>
                      {form.isAvailable ? 'Còn' : 'Hết'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Mô tả */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Mô tả món ăn</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: theme.text, borderColor: theme.border }
                  ]}
                  placeholder="Thành phần, đặc điểm nổi bật của món..."
                  placeholderTextColor={theme.textMuted}
                  multiline
                  numberOfLines={3}
                  value={form.description}
                  onChangeText={(val) => setForm((prev) => ({ ...prev, description: val }))}
                />
              </View>

              {/* Ảnh URL */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Đường dẫn ảnh (Image URL)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: theme.text, borderColor: theme.border }]}
                  placeholder="https://images.unsplash.com/..."
                  placeholderTextColor={theme.textMuted}
                  value={form.imageUrl}
                  onChangeText={(val) => setForm((prev) => ({ ...prev, imageUrl: val }))}
                />
              </View>

              {/* Modifier Groups Section */}
              <View style={styles.modifierSection}>
                <View style={styles.modSectionHeader}>
                  <View>
                    <Text style={[styles.modSectionTitle, { color: theme.text }]}>⚙️ Nhóm Tùy Chọn (Modifiers)</Text>
                    <Text style={[styles.modSectionSubtitle, { color: theme.textMuted }]}>
                      Cỡ ly, Vị sốt cay, Topping thêm...
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.addModGroupBtn, { backgroundColor: isDark ? '#065F46' : '#ECFDF5', borderColor: isDark ? '#047857' : '#A7F3D0' }]}
                    onPress={addModifierGroup}
                  >
                    <Text style={[styles.addModGroupBtnText, { color: isDark ? '#6EE7B7' : '#065F46' }]}>
                      ➕ Thêm Nhóm
                    </Text>
                  </TouchableOpacity>
                </View>

                {form.modifierGroups.length === 0 ? (
                  <View style={[styles.noModBox, { borderColor: theme.border }]}>
                    <Text style={[styles.noModText, { color: theme.textMuted }]}>
                      Món này chưa có nhóm tùy chọn nào. Nhấn &quot;Thêm Nhóm&quot; nếu có yêu cầu chọn size, vị, topping...
                    </Text>
                  </View>
                ) : (
                  form.modifierGroups.map((group, groupIdx) => {
                    const minVal = parseInt(group.minSelectStr || '0', 10);
                    const maxVal = parseInt(group.maxSelectStr || '1', 10);
                    const hasRuleError = minVal > maxVal || group.options.length < maxVal;

                    return (
                      <View
                        key={groupIdx}
                        style={[
                          styles.groupCard,
                          { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: hasRuleError ? '#EF4444' : theme.border }
                        ]}
                      >
                        {/* Group Header */}
                        <View style={styles.groupCardHeader}>
                          <Text style={[styles.groupCardIndex, { color: theme.primary }]}>
                            Nhóm #{groupIdx + 1}
                          </Text>
                          <TouchableOpacity onPress={() => removeModifierGroup(groupIdx)}>
                            <Text style={styles.deleteGroupBtnText}>🗑️ Xóa nhóm</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Group Name & isRequired */}
                        <View style={styles.formRow}>
                          <View style={[styles.formGroup, { flex: 2, marginRight: spacing.md }]}>
                            <Text style={[styles.subLabel, { color: theme.text }]}>Tên nhóm tùy chọn *</Text>
                            <TextInput
                              style={[styles.inputSmall, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', color: theme.text, borderColor: theme.border }]}
                              placeholder="VD: Cấp độ cay / Size"
                              placeholderTextColor={theme.textMuted}
                              value={group.name}
                              onChangeText={(val) => updateModifierGroup(groupIdx, 'name', val)}
                            />
                          </View>

                          <View style={[styles.formGroup, { flex: 1 }]}>
                            <Text style={[styles.subLabel, { color: theme.text }]}>Bắt buộc?</Text>
                            <View style={styles.switchRowInline}>
                              <Switch
                                value={group.isRequired}
                                onValueChange={(val) => updateModifierGroup(groupIdx, 'isRequired', val)}
                                trackColor={{ false: '#94A3B8', true: theme.primary }}
                                thumbColor="#FFFFFF"
                              />
                              <Text style={[styles.switchStatusText, { color: group.isRequired ? theme.primary : theme.textMuted }]}>
                                {group.isRequired ? 'Có' : 'Không'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Min / Max Select */}
                        <View style={styles.formRow}>
                          <View style={[styles.formGroup, { flex: 1, marginRight: spacing.md }]}>
                            <Text style={[styles.subLabel, { color: theme.text }]}>Chọn tối thiểu (minSelect)</Text>
                            <TextInput
                              style={[styles.inputSmall, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', color: theme.text, borderColor: theme.border }]}
                              placeholder="0"
                              placeholderTextColor={theme.textMuted}
                              keyboardType="numeric"
                              value={group.minSelectStr}
                              onChangeText={(val) => updateModifierGroup(groupIdx, 'minSelectStr', val.replace(/[^0-9]/g, ''))}
                            />
                          </View>

                          <View style={[styles.formGroup, { flex: 1 }]}>
                            <Text style={[styles.subLabel, { color: theme.text }]}>Chọn tối đa (maxSelect)</Text>
                            <TextInput
                              style={[styles.inputSmall, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', color: theme.text, borderColor: theme.border }]}
                              placeholder="1"
                              placeholderTextColor={theme.textMuted}
                              keyboardType="numeric"
                              value={group.maxSelectStr}
                              onChangeText={(val) => updateModifierGroup(groupIdx, 'maxSelectStr', val.replace(/[^0-9]/g, ''))}
                            />
                          </View>
                        </View>

                        {/* Validation notice for group constraints */}
                        {hasRuleError && (
                          <View style={styles.groupConstraintWarning}>
                            <Text style={styles.groupConstraintWarningText}>
                              {minVal > maxVal
                                ? '⚠️ Lỗi: minSelect không được lớn hơn maxSelect'
                                : `⚠️ Cần thêm ít nhất ${maxVal - group.options.length} tùy chọn nữa để đủ maxSelect = ${maxVal}`}
                            </Text>
                          </View>
                        )}

                        {/* Options List */}
                        <Text style={[styles.optionsTitle, { color: theme.text }]}>
                          Danh sách Lựa chọn ({group.options.length})
                        </Text>

                        {group.options.map((opt, optIdx) => (
                          <View key={optIdx} style={styles.optionRow}>
                            <TextInput
                              style={[styles.optNameInput, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', color: theme.text, borderColor: theme.border }]}
                              placeholder="Tên tùy chọn (VD: Cay vừa)"
                              placeholderTextColor={theme.textMuted}
                              value={opt.name}
                              onChangeText={(val) => updateOptionInGroup(groupIdx, optIdx, 'name', val)}
                            />

                            <TextInput
                              style={[styles.optPriceInput, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', color: theme.text, borderColor: theme.border }]}
                              placeholder="+0đ"
                              placeholderTextColor={theme.textMuted}
                              keyboardType="numeric"
                              value={opt.priceDeltaStr}
                              onChangeText={(val) => updateOptionInGroup(groupIdx, optIdx, 'priceDeltaStr', val.replace(/[^0-9]/g, ''))}
                            />

                            <TouchableOpacity
                              style={styles.deleteOptionBtn}
                              onPress={() => removeOptionFromGroup(groupIdx, optIdx)}
                            >
                              <Text style={styles.deleteOptionBtnText}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        ))}

                        <TouchableOpacity
                          style={[styles.addOptionBtn, { borderColor: theme.border }]}
                          onPress={() => addOptionToGroup(groupIdx)}
                        >
                          <Text style={[styles.addOptionBtnText, { color: theme.primary }]}>
                            ➕ Thêm Lựa Chọn
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>

            {/* Modal Footer Actions */}
            <View style={[styles.modalFooter, { borderTopColor: theme.border }]}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: theme.border }]}
                onPress={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Hủy Bỏ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={handleSubmitForm}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingItem ? 'Lưu Thay Đổi' : 'Tạo Món Ăn'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1
  },
  actionBarLeft: {
    flex: 1
  },
  screenTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  screenSubtitle: {
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  createBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    minHeight: spacing.touchTargetMobile,
    justifyContent: 'center',
    alignItems: 'center'
  },
  createBtnText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm
  },
  filterSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    height: 44
  },
  searchIcon: {
    fontSize: 16,
    marginRight: spacing.sm
  },
  searchInput: {
    flex: 1,
    fontSize: typography.sizes.sm
  },
  clearSearch: {
    fontSize: 16,
    padding: spacing.xs
  },
  categoryPills: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20
  },
  pillText: {
    fontSize: typography.sizes.xs
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md
  },
  emptyText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  emptySubtext: {
    fontSize: typography.sizes.xs,
    marginTop: spacing.xs,
    textAlign: 'center'
  },
  itemsList: {
    padding: spacing.lg,
    gap: spacing.md
  },
  itemCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    alignItems: 'center'
  },
  itemCardDisabled: {
    opacity: 0.75
  },
  thumbnailContainer: {
    position: 'relative',
    width: 76,
    height: 76,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: spacing.md
  },
  thumbnail: {
    width: '100%',
    height: '100%'
  },
  fallbackThumbnail: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  fallbackIcon: {
    fontSize: 32
  },
  soldOutBadgeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  soldOutBadgeText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.extraBold,
    letterSpacing: 1
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.md
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap'
  },
  itemName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  categoryTag: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4
  },
  categoryTagText: {
    fontSize: 10,
    fontWeight: typography.weights.medium
  },
  itemPrice: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    marginTop: 2
  },
  itemDesc: {
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  modifierBadgesRow: {
    flexDirection: 'row',
    marginTop: spacing.xs
  },
  modBadge: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4
  },
  itemActions: {
    alignItems: 'flex-end',
    gap: spacing.sm
  },
  switchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  switchLabel: {
    fontSize: 11,
    fontWeight: typography.weights.bold
  },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center'
  },
  editBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg
  },
  modalCard: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1
  },
  modalTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  closeBtn: {
    padding: spacing.xs
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: typography.weights.bold
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5'
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  modalBody: {
    padding: spacing.lg,
    gap: spacing.md
  },
  formGroup: {
    gap: spacing.xs
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  subLabel: {
    fontSize: 11,
    fontWeight: typography.weights.medium
  },
  requiredMark: {
    color: '#EF4444'
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.sm
  },
  inputSmall: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: typography.sizes.xs
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top'
  },
  catSelectRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs
  },
  catSelectPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1
  },
  catSelectText: {
    fontSize: typography.sizes.xs
  },
  switchRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 38
  },
  switchStatusText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  modifierSection: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(156, 163, 175, 0.2)',
    paddingTop: spacing.md
  },
  modSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  modSectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  modSectionSubtitle: {
    fontSize: 11
  },
  addModGroupBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1
  },
  addModGroupBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  noModBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center'
  },
  noModText: {
    fontSize: typography.sizes.xs,
    textAlign: 'center'
  },
  groupCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  groupCardIndex: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  deleteGroupBtnText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: typography.weights.bold
  },
  groupConstraintWarning: {
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    padding: spacing.xs,
    marginBottom: spacing.xs
  },
  groupConstraintWarningText: {
    color: '#B91C1C',
    fontSize: 11
  },
  optionsTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    marginTop: spacing.xs,
    marginBottom: spacing.xs
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs
  },
  optNameInput: {
    flex: 2,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: typography.sizes.xs
  },
  optPriceInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: typography.sizes.xs
  },
  deleteOptionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  deleteOptionBtnText: {
    color: '#EF4444',
    fontWeight: typography.weights.bold,
    fontSize: 12
  },
  addOptionBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 6,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    marginTop: spacing.xs
  },
  addOptionBtnText: {
    fontSize: 11,
    fontWeight: typography.weights.bold
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1
  },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: spacing.touchTargetMobile,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelBtnText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium
  },
  saveBtn: {
    borderRadius: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minHeight: spacing.touchTargetMobile,
    justifyContent: 'center',
    alignItems: 'center'
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  }
});
