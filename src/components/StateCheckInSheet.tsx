import React, { useEffect, useMemo, useState } from 'react'
import {
  Modal,
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
import { fmtTime } from '@/utils/timeUtils'

export const STATE_MOODS = ['😄', '🙂', '😐', '😔', '😫'] as const

const LEVEL_OPTIONS = [
  { key: 'low', label: '낮음' },
  { key: 'medium', label: '보통' },
  { key: 'good', label: '좋음' },
] as const

const TAG_OPTIONS = ['불안', '졸림', '두통', '메스꺼움', '식욕 없음', '잠 안 옴'] as const

export type StateMood = (typeof STATE_MOODS)[number]
type LevelKey = (typeof LEVEL_OPTIONS)[number]['key']

type StateCheckInSheetProps = {
  visible: boolean
  dayKey?: string
  initialMood?: StateMood
  onClose: () => void
  onSaved: (message: string) => void
}

export function StateCheckInSheet({
  visible,
  dayKey,
  initialMood,
  onClose,
  onSaved,
}: StateCheckInSheetProps) {
  const insets = useSafeAreaInsets()
  const [mood, setMood] = useState<StateMood>(initialMood ?? '🙂')
  const [condition, setCondition] = useState<LevelKey>('medium')
  const [focus, setFocus] = useState<LevelKey>('medium')
  const [tags, setTags] = useState<string[]>([])
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [openedAt, setOpenedAt] = useState(() => new Date())

  useEffect(() => {
    if (!visible) return
    setOpenedAt(new Date())
    setMood(initialMood ?? '🙂')
    setCondition('medium')
    setFocus('medium')
    setTags([])
    setMemo('')
    setSaving(false)
  }, [initialMood, visible])

  const timeLabel = useMemo(
    () => fmtTime(openedAt.getHours(), openedAt.getMinutes(), { am: '오전', pm: '오후' }),
    [openedAt],
  )

  const toggleTag = (value: string) => {
    setTags(current => current.includes(value)
      ? current.filter(tag => tag !== value)
      : [...current, value])
  }

  const handleClose = () => {
    onClose()
  }

  const handleSave = async () => {
    if (saving) return

    setSaving(true)
    try {
      const stateLogId = await insertStateLog({
        dayKey,
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

      onSaved(reward.awarded ? '기록됐어요 · 🍬 +1' : '기록됐어요')
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>상태 기록</Text>
            <Text style={styles.timeLabel}>{timeLabel}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeText}>닫기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.moodRow}>
            {STATE_MOODS.map(option => {
              const selected = mood === option
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.moodButton, selected && styles.moodButtonSelected]}
                  onPress={() => setMood(option)}
                >
                  <Text style={styles.moodText}>{option}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={styles.levelGrid}>
          <View style={styles.levelBlock}>
            <Text style={styles.sectionTitle}>컨디션</Text>
            <View style={styles.segmentRow}>
              {LEVEL_OPTIONS.map(option => {
                const selected = condition === option.key
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                    onPress={() => setCondition(option.key)}
                  >
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          <View style={styles.levelBlock}>
            <Text style={styles.sectionTitle}>집중</Text>
            <View style={styles.segmentRow}>
              {LEVEL_OPTIONS.map(option => {
                const selected = focus === option.key
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                    onPress={() => setFocus(option.key)}
                  >
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>태그</Text>
          <View style={styles.tagWrap}>
            {TAG_OPTIONS.map(option => {
              const selected = tags.includes(option)
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.tagChip, selected && styles.tagChipSelected]}
                  onPress={() => toggleTag(option)}
                >
                  <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{option}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <TextInput
          style={styles.memoInput}
          value={memo}
          onChangeText={setMemo}
          placeholder="짧게 남기기"
          placeholderTextColor="#8A8F98"
          returnKeyType="done"
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? '기록 중...' : '기록하기'}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,19,25,0.22)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    gap: 14,
    maxHeight: '78%',
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#D8D8D8',
    borderRadius: 999,
    height: 4,
    marginBottom: 2,
    width: 40,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: '#101319',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 31,
  },
  timeLabel: {
    color: '#8A8F98',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  closeText: {
    color: '#101319',
    fontSize: 13,
    fontWeight: '800',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: '#101319',
    fontSize: 14,
    fontWeight: '800',
  },
  moodRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  moodButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  moodButtonSelected: {
    backgroundColor: '#FFF2D8',
    borderColor: '#FF9F0A',
    borderWidth: 1,
  },
  moodText: {
    fontSize: 25,
  },
  levelGrid: {
    gap: 12,
  },
  levelBlock: {
    gap: 8,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 18,
    flex: 1,
    height: 42,
    justifyContent: 'center',
  },
  segmentButtonSelected: {
    backgroundColor: '#FFF2D8',
    borderColor: '#FF9F0A',
    borderWidth: 1,
  },
  segmentText: {
    color: '#8A8F98',
    fontSize: 14,
    fontWeight: '800',
  },
  segmentTextSelected: {
    color: '#101319',
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  tagChipSelected: {
    backgroundColor: '#FFF2D8',
    borderColor: '#FF9F0A',
    borderWidth: 1,
  },
  tagText: {
    color: '#8A8F98',
    fontSize: 12,
    fontWeight: '800',
  },
  tagTextSelected: {
    color: '#101319',
  },
  memoInput: {
    backgroundColor: '#F4F1EA',
    borderRadius: 18,
    color: '#101319',
    fontSize: 14,
    fontWeight: '700',
    height: 42,
    paddingHorizontal: 14,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: designHarness.colors.warning,
    borderRadius: 20,
    height: 54,
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
})
