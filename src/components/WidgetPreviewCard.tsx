import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { designHarness } from '@/design/designHarness'
import type { RoutineWidgetSnapshot } from '@/domain/alarm/widgetState'

export function SmallWidgetPreview({ snapshot }: { snapshot: RoutineWidgetSnapshot }) {
  return (
    <View style={[s.card, s.smallCard]}>
      <Text style={s.title}>{snapshot.small.title}</Text>
      <Text style={s.primary}>{snapshot.small.primary}</Text>
      <Text style={s.secondary}>{snapshot.small.secondary}</Text>
    </View>
  )
}

export function MediumWidgetPreview({ snapshot }: { snapshot: RoutineWidgetSnapshot }) {
  return (
    <View style={[s.card, s.mediumCard]}>
      <View style={s.mediumLeft}>
        <Text style={s.title}>{snapshot.medium.title}</Text>
        <Text style={s.progress}>{snapshot.medium.progress}</Text>
        <Text style={s.secondary}>{snapshot.medium.next}</Text>
      </View>
      <View style={s.mediumRight}>
        {snapshot.medium.items.map(item => (
          <Text key={item.id} style={s.itemLine}>
            {item.label} {item.statusLabel}
          </Text>
        ))}
      </View>
    </View>
  )
}

export function LockWidgetPreview({ snapshot }: { snapshot: RoutineWidgetSnapshot }) {
  return (
    <View style={s.lockRow}>
      <View style={s.lockCircle}>
        <Text style={s.lockCircleText}>{snapshot.lock.circular}</Text>
      </View>
      <View style={s.lockRect}>
        <Text style={s.lockTitle}>{snapshot.lock.rectangularTitle}</Text>
        <Text style={s.lockMeta}>{snapshot.lock.rectangularMeta}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#f4f1ea',
    borderRadius: 28,
    padding: 16,
    gap: 6,
  },
  smallCard: {
    width: 156,
    height: 156,
    justifyContent: 'space-between',
  },
  mediumCard: {
    minHeight: 156,
    flexDirection: 'row',
    gap: 16,
  },
  mediumLeft: {
    flex: 1,
    justifyContent: 'space-between',
  },
  mediumRight: {
    flex: 1,
    gap: 8,
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: designHarness.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  primary: {
    fontSize: 28,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
  },
  progress: {
    fontSize: 20,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  secondary: {
    fontSize: 13,
    color: designHarness.colors.textSecondary,
  },
  itemLine: {
    fontSize: 14,
    color: designHarness.colors.textStrong,
  },
  lockRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  lockCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f4f1ea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockCircleText: {
    fontSize: 24,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
  },
  lockRect: {
    flex: 1,
    minHeight: 56,
    borderRadius: 22,
    backgroundColor: '#f4f1ea',
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  lockTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  lockMeta: {
    fontSize: 12,
    color: designHarness.colors.textSecondary,
    marginTop: 2,
  },
})
