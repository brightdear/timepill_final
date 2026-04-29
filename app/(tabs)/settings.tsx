import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import {
  DEFAULT_EXTERNAL_APP_LABEL,
  DEFAULT_PRIVATE_NOTIFICATION_BODY,
  DEFAULT_PRIVATE_NOTIFICATION_TITLE,
} from '@/constants/appIdentity'
import { designHarness } from '@/design/designHarness'
import { useSettings } from '@/hooks/useSettings'

const APP_VERSION = '1.0.0'

const LANGUAGE_OPTIONS = [
  { key: 'ko', label: '한국어' },
  { key: 'en', label: 'English' },
  { key: 'ja', label: '日本語' },
] as const

const INTENSITY_OPTIONS = [
  { key: 'light', label: '약하게' },
  { key: 'standard', label: '보통' },
  { key: 'strict', label: '강하게' },
  { key: 'custom', label: '직접 설정' },
] as const

const WIDGET_OPTIONS = [
  { key: 'hidden', label: '숨김' },
  { key: 'aliasOnly', label: '별칭만' },
  { key: 'timeOnly', label: '시간만' },
  { key: 'full', label: '표시' },
] as const

const LOCK_OPTIONS = [
  { key: 'neutral', label: '중립' },
  { key: 'full', label: '표시' },
  { key: 'hidden', label: '숨김' },
] as const

const PRIVACY_OPTIONS = [
  { key: 'hideMedicationName', label: '숨김' },
  { key: 'custom', label: '별칭만' },
  { key: 'public', label: '표시' },
] as const

type SheetState =
  | { kind: 'copy' }
  | { kind: 'privacy' }
  | { kind: 'intensity' }
  | { kind: 'widget' }
  | { kind: 'lock' }
  | null

function optionLabel<T extends readonly { key: string; label: string }[]>(options: T, value?: string | null) {
  return options.find(option => option.key === value)?.label ?? '-'
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { data, loading, update } = useSettings()
  const [sheet, setSheet] = useState<SheetState>(null)
  const [externalLabel, setExternalLabel] = useState('')
  const [privateTitle, setPrivateTitle] = useState('')
  const [privateBody, setPrivateBody] = useState('')

  useEffect(() => {
    if (!data) return
    setExternalLabel(data.externalAppLabel ?? DEFAULT_EXTERNAL_APP_LABEL)
    setPrivateTitle(data.privateNotificationTitle ?? DEFAULT_PRIVATE_NOTIFICATION_TITLE)
    setPrivateBody(data.privateNotificationBody ?? DEFAULT_PRIVATE_NOTIFICATION_BODY)
  }, [data])

  if (loading || !data) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={designHarness.colors.warning} />
      </View>
    )
  }

  const saveCopy = async () => {
    await update({
      externalAppLabel: externalLabel.trim() || DEFAULT_EXTERNAL_APP_LABEL,
      privateNotificationTitle: privateTitle.trim() || DEFAULT_PRIVATE_NOTIFICATION_TITLE,
      privateNotificationBody: privateBody.trim() || DEFAULT_PRIVATE_NOTIFICATION_BODY,
    })
    setSheet(null)
  }

  return (
    <>
      <ScrollView
        style={styles.root}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Text style={styles.title}>설정</Text>

        <SectionCard title="기본 공개 설정">
          <PressRow
            label="공개 범위"
            value={optionLabel(PRIVACY_OPTIONS, data.defaultPrivacyLevel)}
            onPress={() => setSheet({ kind: 'privacy' })}
          />
          <PressRow
            label="기본 문구"
            value={externalLabel || DEFAULT_EXTERNAL_APP_LABEL}
            onPress={() => setSheet({ kind: 'copy' })}
          />
        </SectionCard>

        <SectionCard title="알림">
          <PressRow
            label="알림 문구"
            value={privateBody || DEFAULT_PRIVATE_NOTIFICATION_BODY}
            onPress={() => setSheet({ kind: 'copy' })}
          />
          <PressRow
            label="알림 강도"
            value={optionLabel(INTENSITY_OPTIONS, data.defaultReminderIntensity)}
            onPress={() => setSheet({ kind: 'intensity' })}
          />
          <ToggleRow
            label="완료 알림"
            value={data.completeNotificationEnabled === 1}
            onToggle={(value) => update({ completeNotificationEnabled: value ? 1 : 0 })}
          />
        </SectionCard>

        <SectionCard title="표시">
          <ToggleRow
            label="앱 배지"
            value={data.badgeEnabled === 1}
            onToggle={(value) => update({ badgeEnabled: value ? 1 : 0 })}
          />
          <PressRow
            label="위젯"
            value={optionLabel(WIDGET_OPTIONS, data.defaultWidgetVisibility)}
            onPress={() => setSheet({ kind: 'widget' })}
          />
          <PressRow
            label="잠금화면"
            value={optionLabel(LOCK_OPTIONS, data.defaultLockScreenVisibility)}
            onPress={() => setSheet({ kind: 'lock' })}
          />
        </SectionCard>

        <SectionCard title="언어">
          <View style={styles.segmentWrap}>
            {LANGUAGE_OPTIONS.map(option => {
              const selected = data.language === option.key
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                  onPress={() => update({ language: option.key })}
                >
                  <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </SectionCard>

        <SectionCard title="보호">
          <ToggleRow
            label="앱 잠금"
            value={data.appLockEnabled === 1}
            onToggle={(value) => update({ appLockEnabled: value ? 1 : 0 })}
          />
          <ToggleRow
            label="화면 숨김"
            value={data.screenPrivacyEnabled === 1}
            onToggle={(value) => update({ screenPrivacyEnabled: value ? 1 : 0 })}
          />
        </SectionCard>

        <SectionCard title="개발">
          <ToggleRow
            label="개발 모드"
            value={data.devMode === 1}
            onToggle={(value) => update({ devMode: value ? 1 : 0 })}
          />
        </SectionCard>

        <SectionCard title="앱 정보">
          <PressRow label="앱 이름" value="Timepill" />
          <PressRow label="버전" value={APP_VERSION} />
          <PressRow label="남은 프리즈" value={`${data.freezesRemaining}개`} />
        </SectionCard>
      </ScrollView>

      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setSheet(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}> 
          <View style={styles.sheetHandle} />

          {sheet?.kind === 'copy' ? (
            <View style={styles.sheetBody}>
              <Text style={styles.sheetTitle}>기본 문구</Text>
              <TextInput
                style={styles.sheetInput}
                value={externalLabel}
                onChangeText={setExternalLabel}
                placeholder={DEFAULT_EXTERNAL_APP_LABEL}
                placeholderTextColor="#8A8F98"
              />
              <TextInput
                style={styles.sheetInput}
                value={privateTitle}
                onChangeText={setPrivateTitle}
                placeholder={DEFAULT_PRIVATE_NOTIFICATION_TITLE}
                placeholderTextColor="#8A8F98"
              />
              <TextInput
                style={styles.sheetInput}
                value={privateBody}
                onChangeText={setPrivateBody}
                placeholder={DEFAULT_PRIVATE_NOTIFICATION_BODY}
                placeholderTextColor="#8A8F98"
              />
              <TouchableOpacity style={styles.sheetPrimaryButton} onPress={() => void saveCopy()}>
                <Text style={styles.sheetPrimaryButtonText}>저장</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {sheet?.kind === 'privacy' ? (
            <OptionSheet
              title="공개 범위"
              options={PRIVACY_OPTIONS}
              selectedKey={data.defaultPrivacyLevel}
              onSelect={(value) => {
                void update({ defaultPrivacyLevel: value as 'hideMedicationName' | 'custom' | 'public' })
                setSheet(null)
              }}
            />
          ) : null}

          {sheet?.kind === 'intensity' ? (
            <OptionSheet
              title="알림 강도"
              options={INTENSITY_OPTIONS}
              selectedKey={data.defaultReminderIntensity}
              onSelect={(value) => {
                void update({ defaultReminderIntensity: value as 'light' | 'standard' | 'strict' | 'custom' })
                setSheet(null)
              }}
            />
          ) : null}

          {sheet?.kind === 'widget' ? (
            <OptionSheet
              title="위젯"
              options={WIDGET_OPTIONS}
              selectedKey={data.defaultWidgetVisibility}
              onSelect={(value) => {
                void update({ defaultWidgetVisibility: value as 'full' | 'aliasOnly' | 'timeOnly' | 'hidden' })
                setSheet(null)
              }}
            />
          ) : null}

          {sheet?.kind === 'lock' ? (
            <OptionSheet
              title="잠금화면"
              options={LOCK_OPTIONS}
              selectedKey={data.defaultLockScreenVisibility}
              onSelect={(value) => {
                void update({ defaultLockScreenVisibility: value as 'neutral' | 'full' | 'hidden' })
                setSheet(null)
              }}
            />
          ) : null}
        </View>
      </Modal>
    </>
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

function PressRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowTrailing}>
        <Text style={styles.rowValue}>{value}</Text>
        {onPress ? <Ionicons name="chevron-forward" size={16} color="#8A8F98" /> : null}
      </View>
    </TouchableOpacity>
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
    <View style={styles.row}>
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

function OptionSheet({
  title,
  options,
  selectedKey,
  onSelect,
}: {
  title: string
  options: ReadonlyArray<{ key: string; label: string }>
  selectedKey?: string | null
  onSelect: (key: string) => void
}) {
  return (
    <View style={styles.sheetBody}>
      <Text style={styles.sheetTitle}>{title}</Text>
      {options.map(option => (
        <TouchableOpacity key={option.key} style={styles.optionRow} onPress={() => onSelect(option.key)}>
          <Text style={styles.optionRowText}>{option.label}</Text>
          {selectedKey === option.key ? <Ionicons name="checkmark" size={18} color={designHarness.colors.warning} /> : null}
        </TouchableOpacity>
      ))}
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
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800',
    color: '#101319',
    marginBottom: 18,
  },
  card: {
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8A8F98',
    marginBottom: 6,
  },
  row: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F3',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101319',
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '58%',
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8A8F98',
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentButton: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: '#F1F1F3',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonSelected: {
    backgroundColor: '#FFF2D8',
    borderWidth: 1,
    borderColor: '#FF9F0A',
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8A8F98',
  },
  segmentButtonTextSelected: {
    color: '#101319',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(16,19,25,0.22)',
  },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: '#D8D8D8',
    marginBottom: 12,
  },
  sheetBody: {
    gap: 12,
  },
  sheetTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#101319',
    marginBottom: 6,
  },
  sheetInput: {
    minHeight: 54,
    borderRadius: 20,
    backgroundColor: '#F1F1F3',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#101319',
  },
  sheetPrimaryButton: {
    height: 52,
    borderRadius: 20,
    backgroundColor: '#FF9F0A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  sheetPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  optionRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F3',
  },
  optionRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101319',
  },
})
