import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { WheelColumn } from './WheelColumn'
import type { CycleConfig } from '@backend/db/schema'

const CYCLE_TYPES = [
  { key: 'daily' as const,         label: '매일' },
  { key: 'weekly' as const,        label: '주중' },
  { key: 'weekends' as const,      label: '주말' },
  { key: 'specific_days' as const, label: '요일 선택' },
  { key: 'rest' as const,          label: '휴약기' },
]

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const REST_VALS = Array.from({ length: 99 }, (_, i) => String(i + 1))

interface Props {
  value: CycleConfig
  onChange: (c: CycleConfig) => void
}

export function CyclePicker({ value, onChange }: Props) {
  return (
    <View>
      <View style={s.typeRow}>
        {CYCLE_TYPES.map(({ key, label }) => {
          const active = value.type === key
          return (
            <TouchableOpacity
              key={key}
              style={[s.typeBtn, active && s.typeBtnOn]}
              onPress={() => {
                if (active) return
                if (key === 'specific_days') {
                  onChange({ type: 'specific_days', days: [1, 2, 3, 4, 5] })
                } else if (key === 'rest') {
                  onChange({ type: 'rest', active_value: 1, rest_value: 1, unit: 'day' })
                } else {
                  onChange({ type: key })
                }
              }}
            >
              <Text style={[s.typeTxt, active && s.typeTxtOn]}>{label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {value.type === 'specific_days' && (
        <View style={s.dayRow}>
          {DAY_LABELS.map((label, i) => {
            const on = value.days.includes(i)
            return (
              <TouchableOpacity
                key={i}
                style={[s.dayBtn, on && s.dayBtnOn]}
                onPress={() => {
                  const days = on
                    ? value.days.filter(d => d !== i)
                    : [...value.days, i].sort((a, b) => a - b)
                  if (days.length === 0) return
                  onChange({ type: 'specific_days', days })
                }}
              >
                <Text style={[s.dayTxt, on && s.dayTxtOn]}>{label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {value.type === 'rest' && (
        <View style={s.restRow}>
          <Text style={s.restLabel}>복용</Text>
          <WheelColumn
            items={REST_VALS}
            selectedIndex={value.active_value - 1}
            onIndexChange={i => onChange({ ...value, active_value: i + 1 })}
            width={64}
            enableDirectInput
            numericInput
          />
          <Text style={s.restSlash}>/</Text>
          <WheelColumn
            items={REST_VALS}
            selectedIndex={value.rest_value - 1}
            onIndexChange={i => onChange({ ...value, rest_value: i + 1 })}
            width={64}
            enableDirectInput
            numericInput
          />
          <View style={s.unitGroup}>
            {(['day', 'week'] as const).map((u, i) => {
              const on = value.unit === u
              return (
                <TouchableOpacity
                  key={u}
                  style={[s.unitBtn, on && s.unitBtnOn]}
                  onPress={() => onChange({ ...value, unit: u })}
                >
                  <Text style={[s.unitTxt, on && s.unitTxtOn]}>{i === 0 ? '일' : '주'}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f2f2f2',
  },
  typeBtnOn: {
    backgroundColor: '#111',
  },
  typeTxt: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  typeTxtOn: {
    color: '#fff',
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  dayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnOn: {
    backgroundColor: '#111',
  },
  dayTxt: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  dayTxtOn: {
    color: '#fff',
  },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  restLabel: {
    fontSize: 14,
    color: '#666',
  },
  restSlash: {
    fontSize: 20,
    color: '#aaa',
  },
  unitGroup: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 8,
  },
  unitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f2f2f2',
  },
  unitBtnOn: {
    backgroundColor: '#111',
  },
  unitTxt: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  unitTxtOn: {
    color: '#fff',
  },
})
