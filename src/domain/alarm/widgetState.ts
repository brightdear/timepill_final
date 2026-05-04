import { db } from '@/db/client'
import { doseRecords, medications, settings, timeSlots } from '@/db/schema'
import { translate, type Lang } from '@/constants/translations'
import { resolveExternalAppLabel, resolveSlotAlias, resolveWidgetVisibility } from '@/domain/alarm/privacy'
import { getLocalDateKey } from '@/utils/dateUtils'
import { fmtTime } from '@/utils/timeUtils'
import { eq } from 'drizzle-orm'

export type WidgetStateType = 'allDone' | 'upcoming' | 'dueNow' | 'overdue' | 'missed'

export type WidgetTimelineItem = {
  id: string
  label: string
  timeLabel: string
  statusLabel: string
  state: WidgetStateType
}

export type RoutineWidgetSnapshot = {
  state: WidgetStateType
  pendingCount: number
  completedCount: number
  totalCount: number
  nextTimeLabel: string | null
  small: {
    title: string
    primary: string
    secondary: string
  }
  medium: {
    title: string
    progress: string
    next: string
    items: WidgetTimelineItem[]
  }
  large: {
    title: string
    progress: string
    items: WidgetTimelineItem[]
    actionLabel: string
  }
  lock: {
    circular: string
    rectangularTitle: string
    rectangularMeta: string
    inline: string
  }
}

type SlotRow = typeof timeSlots.$inferSelect
type MedicationRow = typeof medications.$inferSelect
type DoseRecordRow = typeof doseRecords.$inferSelect

function resolveState(record: DoseRecordRow | undefined, scheduledTime: string): WidgetStateType {
  if (!record) return 'upcoming'
  if (record.status === 'completed' || record.status === 'frozen') return 'allDone'
  if (record.status === 'skipped' || record.status === 'missed') return 'missed'

  const now = Date.now()
  const scheduled = new Date(record.snoozedUntil ?? scheduledTime).getTime()
  const diffMinutes = Math.floor((now - scheduled) / (60 * 1000))

  if (diffMinutes >= 30) return 'overdue'
  if (diffMinutes >= 0) return 'dueNow'
  return 'upcoming'
}

function normalizeLanguage(value?: string | null): Lang {
  if (value === 'en' || value === 'ja') return value
  return 'ko'
}

function stateLabel(state: WidgetStateType, language: Lang): string {
  switch (state) {
    case 'allDone':
      return translate(language, 'widgetStateDone')
    case 'upcoming':
      return translate(language, 'widgetStateUpcoming')
    case 'dueNow':
      return translate(language, 'widgetStateDue')
    case 'overdue':
      return translate(language, 'widgetStateOverdue')
    case 'missed':
      return translate(language, 'widgetStateMissed')
  }
}

function resolveWidgetLabel(slot: SlotRow, medication: MedicationRow | undefined, language: Lang): string {
  const visibility = resolveWidgetVisibility(slot)
  if (visibility === 'timeOnly') return fmtTime(slot.hour, slot.minute)
  if (visibility === 'full' && slot.privacyLevel === 'public' && (medication?.aliasName || medication?.name)) {
    return medication.aliasName || medication.name
  }
  return resolveSlotAlias(slot, language)
}

export async function buildRoutineWidgetSnapshot(): Promise<RoutineWidgetSnapshot> {
  const todayKey = getLocalDateKey()
  const [allSlots, allMeds, todayRecords, appSettings] = await Promise.all([
    db.select().from(timeSlots),
    db.select().from(medications),
    db.select().from(doseRecords).where(eq(doseRecords.dayKey, todayKey)),
    db.select().from(settings).where(eq(settings.id, 1)).get(),
  ])

  const medMap = new Map(allMeds.map(med => [med.id, med]))
  const recordMap = new Map(todayRecords.map(record => [record.timeSlotId ?? '', record]))
  const language = normalizeLanguage(appSettings?.language)

  const visibleSlots = allSlots.filter(slot => resolveWidgetVisibility(slot) !== 'hidden' && slot.isActive === 1)
  const timelineItems = visibleSlots
    .map(slot => {
      const record = recordMap.get(slot.id)
      const state = resolveState(
        record,
        `${todayKey}T${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}:00.000`,
      )
      return {
        id: slot.id,
        label: resolveWidgetLabel(slot, medMap.get(slot.medicationId), language),
        timeLabel: fmtTime(slot.hour, slot.minute),
        statusLabel: stateLabel(state, language),
        state,
        sortTime: slot.hour * 60 + slot.minute,
      }
    })
    .sort((a, b) => a.sortTime - b.sortTime)

  const completedCount = todayRecords.filter(record => record.status === 'completed' || record.status === 'frozen').length
  const pendingRecords = todayRecords.filter(record => record.status === 'pending')
  const pendingCount = pendingRecords.filter(record => {
    const slot = allSlots.find(item => item.id === record.timeSlotId)
    return slot?.badgeEnabled !== 0
  }).length
  const totalCount = todayRecords.length

  const nextItem = timelineItems.find(item => item.state === 'dueNow' || item.state === 'overdue' || item.state === 'upcoming') ?? null
  const hasMissed = timelineItems.some(item => item.state === 'missed')
  const hasOverdue = timelineItems.some(item => item.state === 'overdue')
  const hasDue = timelineItems.some(item => item.state === 'dueNow')
  const allDone = totalCount > 0 && pendingCount === 0 && !hasMissed

  let state: WidgetStateType = 'upcoming'
  if (allDone) state = 'allDone'
  else if (hasOverdue) state = 'overdue'
  else if (hasDue) state = 'dueNow'
  else if (hasMissed) state = 'missed'

  const nextTimeLabel = nextItem ? translate(language, 'widgetNextPrefix', { time: nextItem.timeLabel }) : null
  const smallPrimary = allDone
    ? translate(language, 'widgetStateDone')
    : pendingCount > 0
      ? translate(language, 'widgetPendingCount', { count: pendingCount })
      : nextTimeLabel ?? translate(language, 'widgetTitle')
  const smallSecondary = allDone
    ? translate(language, 'widgetAllDone')
    : state === 'missed'
      ? translate(language, 'widgetRecordNeeded')
      : pendingCount > 0
        ? translate(language, 'widgetNeedsCheck')
        : translate(language, 'homeSummaryNoNext')

  const progress = totalCount > 0
    ? translate(language, 'widgetProgress', { done: completedCount, total: totalCount })
    : translate(language, 'widgetNoSchedule')
  const nextText = nextTimeLabel ?? resolveExternalAppLabel(appSettings)
  const timeline = timelineItems.slice(0, 4)

  return {
    state,
    pendingCount,
    completedCount,
    totalCount,
    nextTimeLabel,
    small: {
      title: translate(language, 'widgetTitle'),
      primary: smallPrimary,
      secondary: smallSecondary,
    },
    medium: {
      title: translate(language, 'widgetTitle'),
      progress,
      next: nextText,
      items: timeline.slice(0, 3),
    },
    large: {
      title: translate(language, 'widgetTitle'),
      progress,
      items: timeline,
      actionLabel: translate(language, 'widgetActionCheck'),
    },
    lock: {
      circular: allDone ? '✓' : hasOverdue ? '!' : String(Math.max(1, pendingCount)),
      rectangularTitle: totalCount > 0
        ? `${translate(language, 'widgetTitle')} ${completedCount}/${totalCount}`
        : translate(language, 'widgetTitle'),
      rectangularMeta: pendingCount > 0
        ? translate(language, 'widgetPendingCount', { count: pendingCount })
        : (nextTimeLabel ?? translate(language, 'widgetAllDone')),
      inline: allDone
        ? translate(language, 'widgetInlineDone')
        : pendingCount > 0
          ? translate(language, 'widgetInlineProgress', { done: completedCount, total: totalCount })
          : (nextTimeLabel ?? translate(language, 'widgetNeedsCheck')),
    },
  }
}
