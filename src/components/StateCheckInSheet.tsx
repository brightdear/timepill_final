import React, { useMemo, useRef, useState } from 'react'
import {
  Modal,
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
import { fmtTime } from '@/utils/timeUtils'

const MOODS = ['😄', '🙂', '😐', '😔', '😫'] as const
const LEVEL_OPTIONS = [
  { key: 'low', label: '낮음' },
  { key: 'medium', label: '보통' },
  { key: 'good', label: '좋음' },
] as const
const TAG_OPTIONS = ['불안', '졸림', '두통', '메스꺼움', '식욕 없음', '잠 안 옴'] as const

type LevelKey = (typeof LEVEL_OPTIONS)[number]['key']

type StateCheckInSheetProps = {
  visible: boolean
  onClose: () => void
  onSaved: (message: string) => void
}

export function StateCheckInSheet({ visible, onClose, onSaved }: StateCheckInSheetProps) {
  const insets = useSafeAreaInsets()
  const [mood, setMood] = useState<(typeof MOODS)[number]>('🙂')
  const [condition, setCondition] = useState<LevelKey>('medium')
  const [focus, setFocus] = useState<LevelKey>('medium')
  const [tags, setTags] = useState<string[]>([])
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const openedAt = useRef(new Date())

  const timeLabel = useMemo(
    () => fmtTime(openedAt.current.getHours(), openedAt.current.getMinutes(), { am: '오전', pm: '오후' }),
    [visible],
  )

  const reset = () => {
    openedAt.current = new Date()
    setMood('🙂')
    setCondition('medium')
    setFocus('medium')
    setTags([])
    setMemo('')
  }

  const toggleTag = (value: string) => {
    setTags(current => current.includes(value)
      ? current.filter(tag => tag !== value)
      : [...current, value])
  }

  const handleClose = () => {
    reset()
    onClose()
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

      onSaved(reward.awarded ? '기록됐어요 · +1 젤리' : '기록됐어요')
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}> 
        <View style={styles.handle} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>상태 기록</Text>
          <Text style={styles.timeLabel}>{timeLabel}</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>기분</Text>
            <View style={styles.moodRow}>
              {MOODS.map(option => {
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

          <View style={styles.section}>
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

          <View style={styles.section}>
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>메모</Text>
            <TextInput
              style={styles.memoInput}
              value={memo}
              onChangeText={setMemo}
              placeholder="짧게 남기기"
              placeholderTextColor="#8A8F98"
              multiline
            />
          </View>
        </ScrollView>

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
    maxHeight: '82%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: '#D8D8D8',
    marginBottom: 12,
  },
  content: {
    gap: 18,
    paddingBottom: 20,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    color: '#101319',
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8F98',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101319',
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  moodButton: {
    width: 54,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodButtonSelected: {
    backgroundColor: '#FFF2D8',
    borderWidth: 1,
    borderColor: '#FF9F0A',
  },
  moodText: {
    fontSize: 24,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 18,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonSelected: {
    backgroundColor: '#FFF2D8',
    borderWidth: 1,
    borderColor: '#FF9F0A',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8A8F98',
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
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: '#F1F1F3',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagChipSelected: {
    backgroundColor: '#FFF2D8',
    borderWidth: 1,
    borderColor: '#FF9F0A',
  },
  tagText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8F98',
  },
  tagTextSelected: {
    color: '#101319',
  },
  memoInput: {
    minHeight: 92,
    borderRadius: 24,
    backgroundColor: '#F4F1EA',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    color: '#101319',
    textAlignVertical: 'top',
  },
  saveButton: {
    height: 54,
    borderRadius: 20,
    backgroundColor: designHarness.colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
})