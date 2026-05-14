import React, { useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { designHarness } from '@/design/designHarness'
import { devAddJelly } from '@/domain/reward/repository'
import { useSettings } from '@/hooks/useSettings'

const PRIVACY_OPTIONS = [
  { key: 'hideMedicationName', label: '숨김' },
  { key: 'custom', label: '별칭만' },
  { key: 'public', label: '표시' },
] as const

const INTENSITY_OPTIONS = [
  { key: 'light', label: '약하게' },
  { key: 'normal', label: '보통' },
  { key: 'strong', label: '강하게' },
] as const

const LANGUAGE_OPTIONS = [
  { key: 'ko', label: '한국어' },
  { key: 'en', label: '영어' },
  { key: 'ja', label: '일본어' },
] as const

export default function SettingsTabScreen() {
  const insets = useSafeAreaInsets()
  const { data, loading, update } = useSettings()
  const [jellyAdding, setJellyAdding] = useState(false)

  if (loading || !data) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={designHarness.colors.warning} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 24,
      }}
    >
      <Text style={styles.title}>설정</Text>

      <SectionCard title="기본 공개 설정">
        <ChoiceRow
          label="공개 범위"
          options={PRIVACY_OPTIONS}
          selectedKey={data.defaultPrivacyLevel ?? 'custom'}
          onSelect={(value) => {
            void update({ defaultPrivacyLevel: value as 'hideMedicationName' | 'custom' | 'public' })
          }}
        />
      </SectionCard>

      <SectionCard title="알림 기본값">
        <ChoiceRow
          label="알림 강도"
          options={INTENSITY_OPTIONS}
          selectedKey={data.defaultReminderIntensity ?? 'normal'}
          onSelect={(value) => {
            void update({ defaultReminderIntensity: value as 'light' | 'normal' | 'strong' })
          }}
        />
        <ToggleRow
          label="완료 알림"
          value={data.completeNotificationEnabled === 1}
          onToggle={(value) => update({ completeNotificationEnabled: value ? 1 : 0 })}
        />
      </SectionCard>

      <SectionCard title="언어">
        <ChoiceRow
          label="앱 언어"
          options={LANGUAGE_OPTIONS}
          selectedKey={data.language ?? 'ko'}
          onSelect={(value) => {
            void update({ language: value as 'ko' | 'en' | 'ja' })
          }}
        />
      </SectionCard>

      <SectionCard title="보호">
        <ToggleRow
          label="앱 잠금"
          value={data.appLockEnabled === 1}
          onToggle={(value) => update({ appLockEnabled: value ? 1 : 0 })}
        />
        <ToggleRow
          label="화면 가리기"
          value={data.screenPrivacyEnabled === 1}
          onToggle={(value) => update({ screenPrivacyEnabled: value ? 1 : 0 })}
        />
      </SectionCard>

      {__DEV__ ? (
        <SectionCard title="개발자">
          {([100, 500, 1000] as const).map(amount => (
            <TouchableOpacity
              key={amount}
              disabled={jellyAdding}
              style={styles.devJellyButton}
              onPress={async () => {
                setJellyAdding(true)
                await devAddJelly(amount)
                setJellyAdding(false)
              }}
            >
              <Text style={styles.devJellyText}>
                {jellyAdding ? '충전 중…' : `🍬 +${amount} 젤리 충전`}
              </Text>
            </TouchableOpacity>
          ))}
        </SectionCard>
      ) : null}
    </ScrollView>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function ChoiceRow({
  label,
  options,
  selectedKey,
  onSelect,
}: {
  label: string
  options: ReadonlyArray<{ key: string; label: string }>
  selectedKey: string
  onSelect: (key: string) => void
}) {
  return (
    <View style={styles.blockRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map(option => {
          const selected = option.key === selectedKey
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.chipButton, selected && styles.chipButtonSelected]}
              onPress={() => onSelect(option.key)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function ToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string
  value: boolean
  onToggle: (value: boolean) => void
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#D8D8D8', true: '#FFD08A' }}
        thumbColor={value ? designHarness.colors.warning : '#FFFFFF'}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF8',
  },
  title: {
    color: '#101319',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    color: '#8A8F98',
    fontSize: 13,
    fontWeight: '800',
  },
  blockRow: {
    gap: 10,
  },
  toggleRow: {
    alignItems: 'center',
    borderTopColor: '#F1F1F3',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingTop: 12,
  },
  rowLabel: {
    color: '#101319',
    fontSize: 15,
    fontWeight: '700',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chipButtonSelected: {
    backgroundColor: '#FFF2D8',
    borderColor: '#FF9F0A',
    borderWidth: 1,
  },
  chipText: {
    color: '#8A8F98',
    fontSize: 12,
    fontWeight: '800',
  },
  chipTextSelected: {
    color: '#101319',
  },
  devJellyButton: {
    alignItems: 'center',
    backgroundColor: '#FFF2D8',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
  },
  devJellyText: {
    color: '#B06912',
    fontSize: 14,
    fontWeight: '800',
  },
})
