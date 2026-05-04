import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { DoseRecord } from '@/hooks/useMonthlyRecords'

type Props = {
  year: number
  month: number
  records: DoseRecord[]
  colorMap: Record<string, string>
  onDayPress: (dayKey: string) => void
  selectedDay: string | null
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function dotOpacity(statuses: string[]): number {
  const done = statuses.filter(s => s === 'completed').length
  if (done === statuses.length) return 1
  if (done > 0) return 0.55
  return 0.22
}

export function CalendarView({ year, month, records, colorMap, onDayPress, selectedDay }: Props) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()

  // Group: dayKey → medicationKey → { color, statuses }
  const dayMap = new Map<string, Map<string, { color: string; statuses: string[] }>>()

  for (const r of records) {
    if (!dayMap.has(r.dayKey)) dayMap.set(r.dayKey, new Map())
    const byMed = dayMap.get(r.dayKey)!
    const key = r.medicationId ?? `name:${r.medicationName}`
    const color = (r.medicationId ? colorMap[r.medicationId] : undefined)
      ?? colorMap[`name:${r.medicationName}`]
      ?? '#999'
    if (!byMed.has(key)) byMed.set(key, { color, statuses: [] })
    byMed.get(key)!.statuses.push(r.status)
  }

  const blanks = firstDayOfWeek
  const cells: (number | null)[] = [
    ...Array<null>(blanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  return (
    <View>
      <View style={s.weekRow}>
        {WEEKDAY_LABELS.map(d => (
          <View key={d} style={s.headerCell}>
            <Text style={s.headerTxt}>{d}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={s.weekRow}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={s.cell} />
            const dayKey = `${year}-${pad(month)}-${pad(day)}`
            const isSelected = selectedDay === dayKey
            const meds = dayMap.get(dayKey)

            return (
              <TouchableOpacity
                key={di}
                style={[s.cell, isSelected && s.cellSelected]}
                onPress={() => onDayPress(dayKey)}
                activeOpacity={0.7}
              >
                <Text style={[s.dayNum, isSelected && s.dayNumSelected]}>{day}</Text>
                {meds && meds.size > 0 && (
                  <View style={s.dotsRow}>
                    {Array.from(meds.values()).slice(0, 5).map((m, idx) => (
                      <View
                        key={idx}
                        style={[
                          s.dot,
                          { backgroundColor: m.color, opacity: dotOpacity(m.statuses) },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  weekRow: { flexDirection: 'row' },
  headerCell: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  headerTxt: { fontSize: 12, color: '#999', fontWeight: '600' },
  cell: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  cellSelected: { backgroundColor: '#f5f5f5' },
  dayNum: { fontSize: 14, color: '#222', fontWeight: '500' },
  dayNumSelected: { color: '#111', fontWeight: '700' },
  dotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginTop: 3,
    justifyContent: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
})
