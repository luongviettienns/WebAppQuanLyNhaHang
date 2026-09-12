import React, { useState, useMemo } from 'react';
import { ImageIcon, Pencil, Plus, Search, Trash2, X } from 'lucide-react-native';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  Switch,
  Platform,
  useWindowDimensions
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { MenuItemDto, MenuItemUpsertDto } from '../../api/contracts';
import { elevation, radii, spacing, statusColors, typography } from '../../theme';
import { AppIcon, Button, EmptyState, Field, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';

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
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
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
  const isMobile = width < 768;
  const switchAppearance = {
    style: styles.switchTarget,
    thumbColor: theme.surfaceBase,
    ...(Platform.OS === 'web' ? { activeThumbColor: theme.surfaceBase } : {})
  };

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
    <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[styles.toolbar, isMobile && styles.toolbarMobile, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <ScreenHeader
          title="Quản lý thực đơn"
          description={`${filteredItems.length} món đang hiển thị`}
          actions={<Button testID="admin-btn-add-item" variant="primary" label="Thêm món" icon={Plus} onPress={openCreateModal} />}
        />
        <View style={[styles.searchBox, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
          <AppIcon icon={Search} color={theme.textSecondary} size={18} />
          <TextInput
            accessibilityLabel="Tìm món"
            style={[styles.searchInput, { color: theme.textPrimary }]}
            placeholder="Tìm món theo tên hoặc mô tả"
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm" onPress={() => setSearchQuery('')} style={styles.iconButton}>
              <AppIcon icon={X} color={theme.textSecondary} size={18} />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
          {[{ id: null, name: 'Tất cả', count: allMenuItems.length }, ...categories.map((category) => ({
            id: category.id,
            name: category.name,
            count: allMenuItems.filter((item) => item.categoryId === category.id).length
          }))].map((category) => {
            const selected = selectedCategoryId === category.id;
            return (
              <Pressable
                key={category.id ?? 'all'}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSelectedCategoryId(category.id)}
                style={[styles.pill, { backgroundColor: selected ? theme.interactivePrimary : theme.interactiveQuiet }]}
              >
                <Text style={[styles.pillText, { color: selected ? theme.textInverse : theme.textPrimary }]}>{category.name} ({category.count})</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoadingMenu ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang tải thực đơn…</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="Không có món phù hợp"
          description="Thử từ khóa hoặc danh mục khác, hoặc thêm món mới vào thực đơn."
          action={<Button variant="secondary" label="Thêm món" icon={Plus} onPress={openCreateModal} />}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.itemsList}>
          <Surface level="raised" style={styles.menuTable}>
            {!isMobile && (
              <View style={[styles.tableHeader, { backgroundColor: theme.surfaceSunken, borderBottomColor: theme.borderSubtle }]}>
                <Text style={[styles.headerItem, styles.productColumn, { color: theme.textSecondary }]}>Món ăn</Text>
                <Text style={[styles.headerItem, styles.priceColumn, { color: theme.textSecondary }]}>Giá bán</Text>
                <Text style={[styles.headerItem, styles.statusColumn, { color: theme.textSecondary }]}>Tình trạng</Text>
                <Text style={[styles.headerItem, styles.actionColumn, { color: theme.textSecondary }]}>Thao tác</Text>
              </View>
            )}

            {filteredItems.map((item, index) => {
              const isToggling = togglingItemId === item.id;
              const modGroupCount = item.modifierGroups?.length || 0;
              return (
                <View
                  key={item.id}
                  style={[
                    styles.itemRow,
                    isMobile && styles.itemRowMobile,
                    index < filteredItems.length - 1 && { borderBottomColor: theme.borderSubtle, borderBottomWidth: 1 },
                    !item.isAvailable && styles.itemUnavailable
                  ]}
                >
                  <View style={[styles.productCell, !isMobile && styles.productColumn]}>
                    <View style={[styles.thumbnailContainer, { backgroundColor: theme.surfaceSunken }]}>
                      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} resizeMode="cover" /> : <AppIcon icon={ImageIcon} color={theme.textSecondary} size={22} />}
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.itemMeta, { color: theme.textSecondary }]} numberOfLines={2}>
                        {getCategoryName(item.categoryId)}{modGroupCount > 0 ? ` · ${modGroupCount} nhóm tùy chọn` : ''}
                      </Text>
                      {item.description ? <Text style={[styles.itemDescription, { color: theme.textSecondary }]} numberOfLines={2}>{item.description}</Text> : null}
                    </View>
                  </View>

                  <Text style={[styles.itemPrice, !isMobile && styles.priceColumn, { color: theme.textPrimary }]}>{item.basePrice.toLocaleString('vi-VN')} đ</Text>

                  <View style={[styles.availabilityCell, !isMobile && styles.statusColumn]}>
                    <StatusBadge tone={item.isAvailable ? 'success' : 'danger'} label={item.isAvailable ? 'Còn hàng' : 'Hết món'} />
                    {isToggling ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <Switch
                        {...switchAppearance}
                        testID={`menu-item-switch-${item.id}`}
                        accessibilityLabel={`${item.isAvailable ? 'Đánh dấu hết món' : 'Mở bán lại'} ${item.name}`}
                        value={item.isAvailable}
                        onValueChange={() => void handleToggleSoldOut(item)}
                        trackColor={{ false: statusColors.danger.border, true: statusColors.success.border }}
                        thumbColor={theme.surfaceBase}
                      />
                    )}
                  </View>

                  <View style={[styles.actionCell, !isMobile && styles.actionColumn]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Chỉnh sửa món ${item.name}`}
                      onPress={() => openEditModal(item)}
                      style={({ pressed }) => [styles.editButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}
                    >
                      <AppIcon icon={Pencil} color={theme.textPrimary} size={17} />
                      <Text style={[styles.editButtonText, { color: theme.textPrimary }]}>Chỉnh sửa</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </Surface>
        </ScrollView>
      )}

      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalCard, elevation.modal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.modalHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.textPrimary }]}>{editingItem ? 'Chỉnh sửa món' : 'Thêm món mới'}</Text>
                {editingItem && <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>{editingItem.name}</Text>}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Đóng biểu mẫu" onPress={() => setIsModalOpen(false)} style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}>
                <AppIcon icon={X} color={theme.textPrimary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {formError && <InlineAlert title="Chưa thể lưu món" message={formError} />}

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Thông tin món</Text>
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Tên, danh mục và nội dung khách nhìn thấy.</Text>
                </View>
                <Field label="Tên món *" placeholder="Ví dụ: Burger bò phô mai" value={form.name} onChangeText={(value) => setForm((previous) => ({ ...previous, name: value }))} />
                <View style={styles.categoryField}>
                  <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Danh mục *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
                    {categories.map((category) => {
                      const selected = form.categoryId === category.id;
                      return (
                        <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setForm((previous) => ({ ...previous, categoryId: category.id }))} style={[styles.pill, { backgroundColor: selected ? theme.interactivePrimary : theme.interactiveQuiet }]}>
                          <Text style={[styles.pillText, { color: selected ? theme.textInverse : theme.textPrimary }]}>{category.name}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                <Field label="Mô tả" placeholder="Thành phần hoặc đặc điểm của món" multiline numberOfLines={3} style={styles.textArea} value={form.description} onChangeText={(value) => setForm((previous) => ({ ...previous, description: value }))} />
                <Field label="Đường dẫn ảnh" placeholder="https://..." autoCapitalize="none" value={form.imageUrl} onChangeText={(value) => setForm((previous) => ({ ...previous, imageUrl: value }))} />
              </View>

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Giá bán</Text>
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Nhập giá cơ bản trước tùy chọn, theo VND.</Text>
                </View>
                <Field label="Giá cơ bản *" placeholder="65000" keyboardType="numeric" value={form.basePriceStr} onChangeText={(value) => setForm((previous) => ({ ...previous, basePriceStr: value.replace(/[^0-9]/g, '') }))} />
              </View>

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Tình trạng phục vụ</Text>
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Cho phép nhân viên và khách chọn món này ngay sau khi lưu.</Text>
                </View>
                <View style={styles.formAvailability}>
                  <StatusBadge tone={form.isAvailable ? 'success' : 'danger'} label={form.isAvailable ? 'Còn hàng' : 'Hết món'} />
                  <Switch {...switchAppearance} accessibilityLabel="Mở bán món" value={form.isAvailable} onValueChange={(value) => setForm((previous) => ({ ...previous, isAvailable: value }))} trackColor={{ false: statusColors.danger.border, true: statusColors.success.border }} />
                </View>
              </View>

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={[styles.modifierHeader, isMobile && styles.modifierHeaderMobile]}>
                  <View style={styles.sectionHeading}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Nhóm tùy chọn</Text>
                    <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Cỡ phần, vị sốt hoặc món thêm đi kèm.</Text>
                  </View>
                  <Button variant="secondary" label="Thêm nhóm" icon={Plus} onPress={addModifierGroup} />
                </View>

                {form.modifierGroups.length === 0 ? (
                  <EmptyState title="Chưa có nhóm tùy chọn" description="Thêm nhóm khi món cần chọn cỡ, vị hoặc món kèm." />
                ) : form.modifierGroups.map((group, groupIndex) => {
                  const minValue = parseInt(group.minSelectStr || '0', 10);
                  const maxValue = parseInt(group.maxSelectStr || '1', 10);
                  const hasRuleError = minValue > maxValue || group.options.length < maxValue;
                  return (
                    <View key={group.id ?? groupIndex} style={[styles.modifierGroup, { backgroundColor: theme.surfaceSunken, borderColor: hasRuleError ? theme.danger : theme.borderSubtle }]}>
                      <View style={styles.groupHeader}>
                        <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>Nhóm {groupIndex + 1}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Xóa nhóm ${groupIndex + 1}`} onPress={() => removeModifierGroup(groupIndex)} style={styles.destructiveIconButton}>
                          <AppIcon icon={Trash2} color={theme.danger} size={18} />
                        </Pressable>
                      </View>
                      <View style={[styles.formColumns, isMobile && styles.formColumnsMobile]}>
                        <View style={styles.growField}><Field label="Tên nhóm *" placeholder="Ví dụ: Cấp độ cay" value={group.name} onChangeText={(value) => updateModifierGroup(groupIndex, 'name', value)} /></View>
                        <View style={styles.requiredControl}>
                          <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Bắt buộc</Text>
                          <Switch {...switchAppearance} accessibilityLabel={`Bắt buộc nhóm ${groupIndex + 1}`} value={group.isRequired} onValueChange={(value) => updateModifierGroup(groupIndex, 'isRequired', value)} trackColor={{ false: theme.borderStrong, true: theme.interactivePrimary }} />
                        </View>
                      </View>
                      <View style={[styles.formColumns, isMobile && styles.formColumnsMobile]}>
                        <View style={styles.growField}><Field label="Chọn tối thiểu" keyboardType="numeric" value={group.minSelectStr} onChangeText={(value) => updateModifierGroup(groupIndex, 'minSelectStr', value.replace(/[^0-9]/g, ''))} /></View>
                        <View style={styles.growField}><Field label="Chọn tối đa" keyboardType="numeric" value={group.maxSelectStr} onChangeText={(value) => updateModifierGroup(groupIndex, 'maxSelectStr', value.replace(/[^0-9]/g, ''))} /></View>
                      </View>
                      {hasRuleError && <InlineAlert message={minValue > maxValue ? 'Số lượng tối thiểu không được lớn hơn tối đa.' : `Thêm ${maxValue - group.options.length} lựa chọn để đáp ứng số lượng tối đa.`} />}
                      <Text style={[styles.optionsTitle, { color: theme.textPrimary }]}>Lựa chọn ({group.options.length})</Text>
                      {group.options.map((option, optionIndex) => (
                        <View key={option.id ?? optionIndex} style={[styles.optionRow, isMobile && styles.optionRowMobile]}>
                          <View style={styles.optionName}><Field label={`Lựa chọn ${optionIndex + 1}`} placeholder="Tên lựa chọn" value={option.name} onChangeText={(value) => updateOptionInGroup(groupIndex, optionIndex, 'name', value)} /></View>
                          <View style={styles.optionPrice}><Field label="Phụ phí" placeholder="0" keyboardType="numeric" value={option.priceDeltaStr} onChangeText={(value) => updateOptionInGroup(groupIndex, optionIndex, 'priceDeltaStr', value.replace(/[^0-9]/g, ''))} /></View>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Xóa lựa chọn ${optionIndex + 1}`} onPress={() => removeOptionFromGroup(groupIndex, optionIndex)} style={styles.destructiveIconButton}>
                            <AppIcon icon={X} color={theme.danger} size={18} />
                          </Pressable>
                        </View>
                      ))}
                      <Button variant="quiet" label="Thêm lựa chọn" icon={Plus} onPress={() => addOptionToGroup(groupIndex)} />
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { backgroundColor: theme.surfaceBase, borderTopColor: theme.borderSubtle }]}>
              <View style={styles.footerButton}><Button variant="quiet" label="Hủy" disabled={isSubmitting} onPress={() => setIsModalOpen(false)} /></View>
              <View style={styles.footerButtonPrimary}><Button variant="primary" label={editingItem ? 'Lưu thay đổi' : 'Tạo món'} loading={isSubmitting} onPress={() => void handleSubmitForm()} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { borderBottomWidth: 1, gap: spacing.md, padding: spacing.lg },
  toolbarMobile: { padding: spacing.md },
  searchBox: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: spacing.touchTargetMobile, paddingLeft: spacing.md, paddingRight: spacing.xs },
  searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.sm, minHeight: spacing.touchTargetMobile },
  iconButton: { alignItems: 'center', borderRadius: radii.md, height: spacing.touchTargetMobile, justifyContent: 'center', width: spacing.touchTargetMobile },
  categoryPills: { flexDirection: 'row', gap: spacing.sm },
  pill: { borderRadius: radii.pill, justifyContent: 'center', minHeight: spacing.touchTargetMobile, paddingHorizontal: spacing.md },
  pillText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  centerContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl },
  loadingText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, marginTop: spacing.md },
  itemsList: { padding: spacing.lg },
  menuTable: { overflow: 'hidden' },
  tableHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: spacing.touchTargetMobile, paddingHorizontal: spacing.lg },
  headerItem: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  itemRow: { alignItems: 'center', flexDirection: 'row', minHeight: 96, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  itemRowMobile: { alignItems: 'stretch', flexDirection: 'column', gap: spacing.md, paddingHorizontal: spacing.md },
  itemUnavailable: { opacity: 0.72 },
  productColumn: { flex: 4 },
  priceColumn: { flex: 1.2 },
  statusColumn: { alignItems: 'flex-start', flex: 1.8 },
  actionColumn: { alignItems: 'flex-end', width: 128 },
  productCell: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  thumbnailContainer: { alignItems: 'center', borderRadius: radii.md, height: 64, justifyContent: 'center', overflow: 'hidden', width: 64 },
  thumbnail: { height: '100%', width: '100%' },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md },
  itemMeta: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  itemDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  itemPrice: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, fontVariant: ['tabular-nums'] },
  availabilityCell: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  switchTarget: { justifyContent: 'center', minHeight: spacing.touchTargetMobile, minWidth: spacing.touchTargetMobile },
  actionCell: { justifyContent: 'center' },
  editButton: { alignItems: 'center', borderRadius: radii.md, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: spacing.touchTargetMobile, paddingHorizontal: spacing.md },
  editButtonText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  modalOverlay: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.md },
  modalCard: { borderRadius: radii.md, borderWidth: 1, maxHeight: '94%', maxWidth: 760, overflow: 'hidden', width: '100%' },
  modalHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  modalHeadingCopy: { flex: 1, gap: 2 },
  modalTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, lineHeight: typography.lineHeights.xl },
  modalSubtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  modalBody: { gap: spacing.md, padding: spacing.lg },
  formSection: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  sectionHeading: { flex: 1, gap: 2 },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md },
  sectionDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  fieldLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  categoryField: { gap: spacing.xs },
  textArea: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  formAvailability: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', minHeight: spacing.touchTargetMobile },
  modifierHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  modifierHeaderMobile: { alignItems: 'stretch', flexDirection: 'column' },
  modifierGroup: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  groupHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  groupTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  destructiveIconButton: { alignItems: 'center', borderRadius: radii.md, height: spacing.touchTargetMobile, justifyContent: 'center', width: spacing.touchTargetMobile },
  formColumns: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.md },
  formColumnsMobile: { alignItems: 'stretch', flexDirection: 'column' },
  growField: { flex: 1 },
  requiredControl: { gap: spacing.xs, minWidth: 112 },
  optionsTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  optionRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  optionRowMobile: { alignItems: 'stretch', flexWrap: 'wrap' },
  optionName: { flex: 2, minWidth: 180 },
  optionPrice: { flex: 1, minWidth: 120 },
  modalFooter: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md },
  footerButton: { minWidth: 104 },
  footerButtonPrimary: { minWidth: 152 }
});
