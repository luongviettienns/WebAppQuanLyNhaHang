import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EmployeeSettingsDestination, EmployeeSettingsWorkspaceDto } from '../../api/employeeSettings';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { buildEmployeeSettingsViewModel } from './employeeSettingsViewModel';

export const EmployeeSettingsInitializationPanel: React.FC<{
  workspace: EmployeeSettingsWorkspaceDto;
  onNavigate: (destination: EmployeeSettingsDestination) => void;
}> = ({ workspace, onNavigate }) => {
  const { theme } = useTheme();
  const model = buildEmployeeSettingsViewModel(workspace);
  return <View style={[styles.panel, { backgroundColor: theme.surfaceBase }]}>
    <View style={styles.headingRow}>
      <View style={styles.headingCopy}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Khởi tạo</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>Hoàn tất các bước nền để xếp lịch, chấm công và tính lương nhất quán.</Text>
      </View>
      <View style={styles.progressBlock}>
        <View style={[styles.progressTrack, { backgroundColor: theme.borderSubtle }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${model.progress.percent}%` }]} />
        </View>
        <Text testID="employee-settings-progress" style={[styles.progressText, { color: theme.textSecondary }]}>{model.progress.label}</Text>
      </View>
    </View>
    {model.checklist.map(step => <Pressable
      key={step.key}
      testID={`settings-checklist-${step.key}`}
      accessibilityRole="button"
      onPress={() => onNavigate(step.destination)}
      style={[styles.step, { borderTopColor: theme.borderSubtle }]}
    >
      <View style={[styles.status, { backgroundColor: step.completed ? theme.interactiveSecondary : theme.surfaceCanvas }]}>
        <Text style={{ color: step.completed ? theme.success : theme.textSecondary }}>{step.completed ? '✓' : '•'}</Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>{step.title}</Text>
        <Text style={[styles.stepDetail, { color: theme.textSecondary }]}>{step.countLabel}</Text>
      </View>
      <Text style={[styles.action, { color: theme.primary }]}>{step.completed ? 'Xem' : 'Thiết lập'}</Text>
    </Pressable>)}
  </View>;
};

const styles = StyleSheet.create({
  panel: { borderRadius: radii.lg, overflow: 'hidden' },
  headingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xl, justifyContent: 'space-between', padding: spacing.xl },
  headingCopy: { flex: 1, gap: spacing.xs }, title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  description: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  progressBlock: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  progressTrack: { borderRadius: radii.pill, height: 8, overflow: 'hidden', width: 120 }, progressFill: { height: 8 },
  progressText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  step: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 72, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  status: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  stepCopy: { flex: 1, gap: 3 }, stepTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  stepDetail: { fontFamily: typography.families.body, fontSize: typography.sizes.sm }, action: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }
});
