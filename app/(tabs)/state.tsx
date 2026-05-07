import React, { useEffect, useRef, useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { awardStateLogReward } from '@/domain/reward/repository'
import { insertStateLog, updateStateLogReward } from '@/domain/stateLog/repository'
import { designHarness } from '@/design/designHarness'
import { STATE_TAG_OPTIONS } from '@/components/StateCheckInSheet'
import { useI18n } from '@/hooks/useI18n'

const MOODS = ['😄', '🙂', '😐', '😔', '😣'] as const
const LEVEL_OPTIONS = [
  { key: 'low', label: '낮음' },
  { key: 'medium', label: '보통' },
  { key: 'good', label: '좋음' },
] as const

export default function StateScreen() {
  const insets = useSafeAreaInsets()
  const { lang } = useI18n()
  const [mood, setMood] = useState<(typeof MOODS)[number]>('🙂')
  const [condition, setCondition] = useState<(typeof LEVEL_OPTIONS)[number]['key']>('medium')
  const [focus, setFocus] = useState<(typeof LEVEL_OPTIONS)[number]['key']>('medium')
  const [tags, setTags] = useState<string[]>([])
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const toggleTag = (value: string) => {
    setTags(current => current.includes(value)
      ? current.filter(tag => tag !== value)
      : [...current, value])
  }

  const showToast = (message: string) => {
    setToastMessage(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 1800)
  }

  const handleSave = async () => {
    if (saving) return

    setSaving(true)
    try {
      const stateLogId = await insertStateLog({
        mood,
        condition,
        focus,
        tags,
        memo,
        rewardGranted: false,
      })

      const reward = await awardStateLogReward(stateLogId)
      if (reward.awarded) {
        await updateStateLogReward(stateLogId, true)
      }

      setTags([])
      setMemo('')
      showToast(reward.awarded ? '기록됐어요 · +1 젤리' : '기록됐어요')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>상태</Text>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>기분</Text>
          <View style={styles.emojiRow}>
            {MOODS.map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.emojiButton, mood === option && styles.emojiButtonActive]}
                onPress={() => setMood(option)}
              >
                <Text style={styles.emojiText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>컨디션</Text>
          <View style={styles.segmentRow}>
            {LEVEL_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.segmentButton, condition === option.key && styles.segmentButtonActive]}
                onPress={() => setCondition(option.key)}
              >
                <Text style={[styles.segmentButtonText, condition === option.key && styles.segmentButtonTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>집중</Text>
          <View style={styles.segmentRow}>
            {LEVEL_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.segmentButton, focus === option.key && styles.segmentButtonActive]}
                onPress={() => setFocus(option.key)}
              >
                <Text style={[styles.segmentButtonText, focus === option.key && styles.segmentButtonTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>태그</Text>
          <View style={styles.tagWrap}>
            {STATE_TAG_OPTIONS[lang].map(option => {
              const selected = tags.includes(option)
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.tagChip, selected && styles.tagChipActive]}
                  onPress={() => toggleTag(option)}
                >
                  <Text style={[styles.tagChipText, selected && styles.tagChipTextActive]}>{option}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>메모</Text>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            placeholder="짧게 남겨두고 싶다면 적어주세요"
            placeholderTextColor={designHarness.colors.textSoft}
            multiline
            style={styles.memoInput}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}> 
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? '저장 중...' : '기록하기'}</Text>
        </TouchableOpacity>
      </View>

      {toastMessage && (
        <View style={[styles.toast, { bottom: insets.bottom + 92 }]}> 
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: designHarness.colors.pageBackground,
  },
  scroll: {
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
    marginBottom: 6,
  },
  card: {
    borderRadius: 28,
    backgroundColor: designHarness.colors.surface,
    padding: 20,
    gap: 14,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  emojiButton: {
    flex: 1,
    minHeight: 70,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.surfaceSoft,
  },
  emojiButtonActive: {
    backgroundColor: '#FFF1D8',
    borderWidth: 1,
    borderColor: '#F6B54C',
  },
  emojiText: {
    fontSize: 28,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.surfaceSoft,
  },
  segmentButtonActive: {
    backgroundColor: designHarness.colors.warning,
  },
  segmentButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  segmentButtonTextActive: {
    color: designHarness.colors.white,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tagChip: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.surfaceSoft,
  },
  tagChipActive: {
    backgroundColor: '#FFE8C3',
  },
  tagChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  tagChipTextActive: {
    color: designHarness.colors.warning,
  },
  memoInput: {
    minHeight: 116,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: designHarness.colors.surfaceSoft,
    fontSize: 15,
    lineHeight: 22,
    color: designHarness.colors.textStrong,
    textAlignVertical: 'top',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    backgroundColor: 'rgba(250,250,248,0.96)',
    borderTopWidth: 1,
    borderTopColor: '#EFEFEA',
  },
  saveButton: {
    minHeight: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.warning,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: designHarness.colors.white,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: designHarness.colors.textStrong,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '700',
    color: designHarness.colors.white,
  },
})
