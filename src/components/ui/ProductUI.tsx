import React from 'react'
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View, type ViewStyle } from 'react-native'
import { Ionicons, type AppIconName } from '@/components/AppIcon'

export const ui = {
  color: {
    background: '#FAFAF8',
    card: '#FFFFFF',
    softCard: '#F4F1EA',
    input: '#F1F1F3',
    border: '#E8EAEE',
    textPrimary: '#101319',
    textSecondary: '#8A8F98',
    orange: '#FF9F0A',
    orangeLight: '#FFF2D8',
    success: '#22C55E',
    danger: '#D9442E',
  },
  radius: {
    card: 16,
    row: 12,
    button: 14,
    pill: 999,
  },
  spacing: {
    screenX: 24,
    sectionGap: 24,
    cardGap: 14,
    rowGap: 10,
    cardPadding: 20,
  },
} as const

export function AppHeader({
  title,
  balance,
  balanceLoading,
  onAdd,
}: {
  title: string
  balance?: number | null
  balanceLoading?: boolean
  onAdd?: () => void
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.pageTitle}>{title}</Text>
      <View style={styles.headerActions}>
        <JellyPill balance={balance} loading={balanceLoading} />
        {onAdd ? (
          <TouchableOpacity style={styles.iconButton} onPress={onAdd} accessibilityLabel="추가">
            <Ionicons name="add" size={24} color={ui.color.textPrimary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}

export function JellyPill({ balance, loading }: { balance?: number | null; loading?: boolean }) {
  return (
    <View style={styles.jellyPill}>
      {loading ? <ActivityIndicator size="small" color={ui.color.orange} /> : <Text style={styles.jellyText}>{balance ?? 0}</Text>}
      <Text style={styles.jellyUnit}>젤리</Text>
    </View>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

export function PrimaryButton({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <TouchableOpacity style={[styles.primaryButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled || loading}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </TouchableOpacity>
  )
}

export function SecondaryButton({ label, icon, onPress }: { label: string; icon?: AppIconName; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.secondaryButton} onPress={onPress}>
      {icon ? <Ionicons name={icon} size={18} color={ui.color.textPrimary} /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  )
}

export function CompactRow({
  title,
  value,
  icon,
  onPress,
}: {
  title: string
  value?: string
  icon?: AppIconName
  onPress?: () => void
}) {
  const Wrapper = onPress ? TouchableOpacity : View
  return (
    <Wrapper style={styles.compactRow} onPress={onPress as never}>
      <View style={styles.rowLeading}>
        {icon ? <Ionicons name={icon} size={18} color={ui.color.textSecondary} /> : null}
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      <View style={styles.rowTrailing}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {onPress ? <Ionicons name="chevron-forward" size={16} color={ui.color.textSecondary} /> : null}
      </View>
    </Wrapper>
  )
}

export function ToggleRow({ title, value, onValueChange }: { title: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.compactRow}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#DADDE3', true: ui.color.orangeLight }}
        thumbColor={value ? ui.color.orange : '#FFFFFF'}
      />
    </View>
  )
}

export function TimeRow({
  timeLabel,
  enabled,
  status,
  onToggle,
  onPress,
  onDelete,
}: {
  timeLabel: string
  enabled: boolean
  status?: string
  onToggle: (enabled: boolean) => void
  onPress?: () => void
  onDelete?: () => void
}) {
  return (
    <TouchableOpacity style={styles.timeRow} onPress={onPress} disabled={!onPress}>
      <View style={styles.timeCopy}>
        <View style={[styles.statusDot, enabled ? styles.statusDotOn : styles.statusDotOff]} />
        <Text style={styles.timeText}>{timeLabel}</Text>
        {status ? <Text style={styles.timeStatus}>{status}</Text> : null}
      </View>
      <View style={styles.timeActions}>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: '#DADDE3', true: ui.color.orangeLight }}
          thumbColor={enabled ? ui.color.orange : '#FFFFFF'}
        />
        {onDelete ? (
          <TouchableOpacity style={styles.deleteButton} onPress={onDelete} accessibilityLabel="삭제">
            <Ionicons name="trash-outline" size={18} color={ui.color.danger} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

export function EmptyState({ title }: { title: string }) {
  return (
    <Card style={styles.emptyCard}>
      <Text style={styles.emptyText}>{title}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  pageTitle: {
    color: ui.color.textPrimary,
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: 0,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  jellyPill: {
    alignItems: 'center',
    backgroundColor: ui.color.orangeLight,
    borderRadius: ui.radius.pill,
    flexDirection: 'row',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  jellyText: {
    color: ui.color.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  jellyUnit: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: ui.radius.card,
    borderWidth: 1,
    padding: ui.spacing.cardPadding,
  },
  sectionTitle: {
    color: ui.color.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: ui.color.textPrimary,
    borderRadius: ui.radius.button,
    height: 56,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
    borderRadius: ui.radius.button,
    flexDirection: 'row',
    gap: 8,
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: ui.color.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  compactRow: {
    alignItems: 'center',
    borderBottomColor: ui.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  rowLeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  rowTrailing: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  rowTitle: {
    color: ui.color.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  rowValue: {
    color: ui.color.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  timeRow: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
    borderRadius: ui.radius.row,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 14,
  },
  timeCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 9,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  statusDotOn: {
    backgroundColor: ui.color.success,
  },
  statusDotOff: {
    backgroundColor: ui.color.textSecondary,
  },
  timeText: {
    color: ui.color.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  timeStatus: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  timeActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  deleteButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyText: {
    color: ui.color.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
})
