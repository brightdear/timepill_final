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
import { useI18n } from '@/hooks/useI18n'
import type { Lang } from '@/constants/translations'
import { fmtTime } from '@/utils/timeUtils'

export const STATE_MOODS = ['😄', '🙂', '😐', '😔', '😫'] as const

const LEVEL_OPTIONS = {
  ko: [
    { key: 'low', label: '낮음' },
    { key: 'medium', label: '보통' },
    { key: 'good', label: '좋음' },
  ],
  en: [
    { key: 'low', label: 'Low' },
    { key: 'medium', label: 'Normal' },
    { key: 'good', label: 'Good' },
  ],
  ja: [
    { key: 'low', label: '低め' },
    { key: 'medium', label: '普通' },
    { key: 'good', label: '良い' },
  ],
} as const

export const STATE_TAG_OPTIONS: Record<Lang, string[]> = {
  ko: [
    '평소와 같음',
    '안정됨',
    '집중 잘됨',
    '피곤',
    '불안',
    '졸림',
    '우울',
    '두통',
    '메스꺼움',
    '예민함',
    '불면',
    '바쁨',
    '외출',
    '공부',
    '운동',
    '생리',
    '식사 불규칙',
    '개운함',
    '기분 좋음',
    '활력 있음',
    '잘 잤음',
    '식욕 좋음',
  ],
  en: [
    'Normal',
    'Calm',
    'Focused',
    'Tired',
    'Anxious',
    'Sleepy',
    'Low',
    'Headache',
    'Nausea',
    'Sensitive',
    'Insomnia',
    'Busy',
    'Outside',
    'Study',
    'Exercise',
    'Period',
    'Irregular meal',
    'Refreshed',
    'Good mood',
    'Energetic',
    'Slept well',
    'Good appetite',
  ],
  ja: [
    'いつも通り',
    '落ち着く',
    '集中できた',
    '疲れ',
    '不安',
    '眠い',
    '落ち込み',
    '頭痛',
    '吐き気',
    '敏感',
    '不眠',
    '忙しい',
    '外出',
    '勉強',
    '運動',
    '生理',
    '食事不規則',
    'すっきり',
    '気分が良い',
    '元気',
    'よく眠れた',
    '食欲あり',
  ],
}

const SHEET_COPY = {
  ko: {
    title: '상태 기록',
    close: '닫기',
    condition: '컨디션',
    focus: '집중',
    tags: '태그',
    memoPlaceholder: '짧게 남기기',
    saving: '기록 중...',
    save: '기록하기',
    saved: '기록됐어요',
    rewarded: '기록됐어요 · +1 젤리',
    am: '오전',
    pm: '오후',
  },
  en: {
    title: 'State log',
    close: 'Close',
    condition: 'Condition',
    focus: 'Focus',
    tags: 'Tags',
    memoPlaceholder: 'Short note',
    saving: 'Saving...',
    save: 'Save',
    saved: 'Saved',
    rewarded: 'Saved · +1 Jelly',
    am: 'AM',
    pm: 'PM',
  },
  ja: {
    title: '状態記録',
    close: '閉じる',
    condition: 'コンディション',
    focus: '集中',
    tags: 'タグ',
    memoPlaceholder: '短く残す',
    saving: '記録中...',
    save: '記録する',
    saved: '記録しました',
    rewarded: '記録しました · +1 Jelly',
    am: '午前',
    pm: '午後',
  },
} as const

export type StateMood = string
type LevelKey = (typeof LEVEL_OPTIONS.ko)[number]['key']

type StateCheckInSheetProps = {
  visible: boolean
  dayKey?: string
  initialMood?: StateMood
  customMoods?: string[]
  onClose: () => void
  onSaved: (message: string) => void
}

export function StateCheckInSheet({
  visible,
  dayKey,
  initialMood,
  customMoods = [],
  onClose,
  onSaved,
}: StateCheckInSheetProps) {
  const insets = useSafeAreaInsets()
  const { lang } = useI18n()
  const copy = SHEET_COPY[lang]
  const levelOptions = LEVEL_OPTIONS[lang]
  const tagOptions = STATE_TAG_OPTIONS[lang]
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

  const moodOptions = useMemo(() => {
    const selectedCustomMood = customMoods.find(item => item === initialMood)
    return [...new Set([...STATE_MOODS, ...(selectedCustomMood ? [selectedCustomMood] : [])])]
  }, [customMoods, initialMood])

  const timeLabel = useMemo(
    () => fmtTime(openedAt.getHours(), openedAt.getMinutes(), { am: copy.am, pm: copy.pm }),
    [copy.am, copy.pm, openedAt],
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

      onSaved(reward.awarded ? copy.rewarded : copy.saved)
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
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.timeLabel}>{timeLabel}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeText}>{copy.close}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.moodRow}>
            {moodOptions.map(option => {
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
            <Text style={styles.sectionTitle}>{copy.condition}</Text>
            <View style={styles.segmentRow}>
              {levelOptions.map(option => {
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
            <Text style={styles.sectionTitle}>{copy.focus}</Text>
            <View style={styles.segmentRow}>
              {levelOptions.map(option => {
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
          <Text style={styles.sectionTitle}>{copy.tags}</Text>
          <View style={styles.tagWrap}>
            {tagOptions.map(option => {
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
          placeholder={copy.memoPlaceholder}
          placeholderTextColor="#8A8F98"
          returnKeyType="done"
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? copy.saving : copy.save}</Text>
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
