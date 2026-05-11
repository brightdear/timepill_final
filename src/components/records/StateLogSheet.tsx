import React, { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { designHarness } from '@/design/designHarness'
import { awardStateLogReward } from '@/domain/reward/repository'
import { insertStateLog, updateStateLogReward } from '@/domain/stateLog/repository'
import { fmtTime } from '@/utils/timeUtils'

const MOODS = ['😄', '🙂', '😐', '😔', '😫'] as const
const LEVEL_OPTIONS = [
  { key: 'low', label: '낮음' },
  { key: 'medium', label: '보통' },
  { key: 'good', label: '좋음' },
] as const
const TAG_OPTIONS = ['불안', '졸림', '두통', '메스꺼움'] as const

type LevelKey = (typeof LEVEL_OPTIONS)[number]['key']
type MoodKey = (typeof MOODS)[number]

type StateLogSheetProps = {
  visible: boolean
  dayKey: string
  onClose: () => void
  onSaved: (message: string) => void
}

function formatDayLabel(dayKey: string) {
  const date = new Date(`${dayKey}T12:00:00`)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

export function StateLogSheet({ visible, dayKey, onClose, onSaved }: StateLogSheetProps) {
  const insets = useSafeAreaInsets()
  const [mood, setMood] = useState<MoodKey>('🙂')
  const [condition, setCondition] = useState<LevelKey>('medium')
  const [focus, setFocus] = useState<LevelKey>('medium')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [openedAt, setOpenedAt] = useState(() => new Date())

  useEffect(() => {
    if (!visible) return
    setMood('🙂')
    setCondition('medium')
    setFocus('medium')
    setTags([])
    setSaving(false)
    setOpenedAt(new Date())
  }, [visible])

  const timeLabel = useMemo(
    () => fmtTime(openedAt.getHours(), openedAt.getMinutes(), { am: '오전', pm: '오후' }),
    [openedAt],
  )

  const toggleTag = (value: string) => {
    setTags(current => current.includes(value)
      ? current.filter(tag => tag !== value)
      : [...current, value])
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
        rewardGranted: false,
      })

      const reward = await awardStateLogReward(stateLogId)
      if (reward.awarded) {
        await updateStateLogReward(stateLogId, true)
      }

      onSaved(reward.awarded ? '기록됐어요 · +1 젤리' : '기록됐어요')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}> 
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>상태 기록</Text>
            <Text style={styles.subtitle}>{formatDayLabel(dayKey)} · {timeLabel}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>닫기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
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

        <View style={styles.levelSection}>
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

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? '저장 중...' : '기록하기'}</Text>
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#D8D8D8',
    borderRadius: 999,
    height: 4,
    width: 40,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerCopy: {
    gap: 3,
  },
  title: {
    color: '#101319',
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: '#8A8F98',
    fontSize: 12,
    fontWeight: '700',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  closeText: {
    color: '#101319',
    fontSize: 12,
    fontWeight: '800',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: '#101319',
    fontSize: 13,
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
    borderRadius: 18,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  moodButtonSelected: {
    backgroundColor: '#FFF2D8',
    borderColor: '#FF9F0A',
    borderWidth: 1,
  },
  moodText: {
    fontSize: 24,
  },
  levelSection: {
    gap: 10,
  },
  levelBlock: {
    gap: 6,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 16,
    flex: 1,
    height: 38,
    justifyContent: 'center',
  },
  segmentButtonSelected: {
    backgroundColor: '#FFF2D8',
    borderColor: '#FF9F0A',
    borderWidth: 1,
  },
  segmentText: {
    color: '#8A8F98',
    fontSize: 13,
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
    height: 32,
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
  saveButton: {
    alignItems: 'center',
    backgroundColor: designHarness.colors.warning,
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
})
