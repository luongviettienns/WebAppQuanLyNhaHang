import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import type { CommissionAssigneeDto } from '../../api/employeeCommissions';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon } from '../../ui';

interface Props {
  lineIndex: number;
  value: number | null;
  assignees: CommissionAssigneeDto[];
  onChange: (employeeId: number | null) => void;
}

export const CommissionAssigneePicker: React.FC<Props> = ({ lineIndex, value, assignees, onChange }) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = assignees.find(employee => employee.id === value);
  const choose = (employeeId: number | null) => { onChange(employeeId); setOpen(false); };
  return <View style={styles.wrap}>
    <Pressable testID={`commission-assignee-current-${lineIndex}`} accessibilityRole="button" accessibilityLabel="Chọn nhân viên hưởng hoa hồng" onPress={() => setOpen(current => !current)} style={[styles.trigger, { backgroundColor: selected ? theme.interactiveSecondary : theme.surfaceBase, borderColor: selected ? theme.primary : theme.borderSubtle }]}>
      <AppIcon icon={UserRound} size={15} color={selected ? theme.primary : theme.textSecondary} />
      <Text numberOfLines={1} style={[styles.triggerText, { color: selected ? theme.primary : theme.textSecondary }]}>{selected ? `${selected.code} · ${selected.name}` : 'Chưa gán hoa hồng'}</Text>
    </Pressable>
    {open && <View style={[styles.menu, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
      <Pressable testID={`commission-assignee-${lineIndex}-none`} accessibilityRole="radio" accessibilityState={{ selected: value === null }} onPress={() => choose(null)} style={styles.option}><Text style={[styles.optionText, { color: theme.textPrimary }]}>Chưa gán</Text></Pressable>
      {assignees.map(employee => <Pressable key={employee.id} testID={`commission-assignee-${lineIndex}-${employee.id}`} accessibilityRole="radio" accessibilityState={{ selected: value === employee.id }} onPress={() => choose(employee.id)} style={styles.option}><Text style={[styles.optionText, { color: theme.textPrimary }]}>{employee.code} · {employee.name}</Text></Pressable>)}
    </View>}
  </View>;
};

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, position: 'relative', zIndex: 5 },
  trigger: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 36, paddingHorizontal: spacing.sm },
  triggerText: { flex: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  menu: { borderRadius: radii.md, borderWidth: 1, left: 0, marginTop: spacing.xs, overflow: 'hidden', position: 'absolute', right: 0, top: 36, zIndex: 10 },
  option: { justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing.md },
  optionText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm }
});
