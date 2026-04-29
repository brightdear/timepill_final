import React from 'react'
import {
  View,
  Text,
  ScrollView,
  Switch,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { useSettings } from '@/hooks/useSettings'
import { type Lang } from '@/constants/translations'

const APP_VERSION = '1.0.0'
const MAX_FREEZES = 3

const LANGUAGES: { key: Lang; label: string }[] = [
  { key: 'ko', label: '한국어' },
  { key: 'en', label: 'English' },
  { key: 'ja', label: '日本語' },
]

export default function SettingsScreen() {
  const { data, loading, update } = useSettings()

  if (loading || !data) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color="#999" />
      </View>
    )
  }

  const privateMode = data.privateMode === 1
  const devMode = data.devMode === 1
  const currentLang = (data.language ?? 'ko') as Lang

  return (
    <ScrollView contentContainerStyle={s.scroll} style={s.root}>
      <Text style={s.title}>설정</Text>

      {/* Private Mode */}
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.rowInfo}>
            <Text style={s.rowLabel}>Private Mode</Text>
            <Text style={s.rowDesc}>약 이름이 "알약1", "알약2"로 표시됩니다</Text>
          </View>
          <Switch
            value={privateMode}
            onValueChange={v => update({ privateMode: v ? 1 : 0 })}
            trackColor={{ false: '#ddd', true: '#111' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Freeze 현황 */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Freeze 현황</Text>
        <View style={s.freezeBar}>
          {Array.from({ length: MAX_FREEZES }).map((_, i) => (
            <View
              key={i}
              style={[
                s.freezeSlot,
                i < data.freezesRemaining && s.freezeSlotFilled,
              ]}
            />
          ))}
        </View>
        <Text style={s.freezeCount}>
          남은 Freeze: {data.freezesRemaining} / {MAX_FREEZES}개
        </Text>
        <Text style={s.freezeDesc}>
          15일 연속 복용 시 Freeze 1개 획득 · 복용을 놓쳤을 때 streak 보호
        </Text>
      </View>

      {/* Language */}
      <View style={s.card}>
        <Text style={s.cardTitle}>언어</Text>
        <View style={s.langRow}>
          {LANGUAGES.map(lang => (
            <TouchableOpacity
              key={lang.key}
              style={[s.langBtn, currentLang === lang.key && s.langBtnActive]}
              onPress={() => update({ language: lang.key })}
            >
              <Text style={[s.langBtnTxt, currentLang === lang.key && s.langBtnTxtActive]}>
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Dev Mode */}
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.rowInfo}>
            <Text style={s.rowLabel}>Dev Mode</Text>
            <Text style={s.rowDesc}>스캔 결과 피드백 UI · FP/FN 저장</Text>
          </View>
          <Switch
            value={devMode}
            onValueChange={v => update({ devMode: v ? 1 : 0 })}
            trackColor={{ false: '#ddd', true: '#f59e0b' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Version */}
      <View style={s.versionBox}>
        <Text style={s.versionTxt}>Timepill v{APP_VERSION}</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f8f8' },
  scroll: { paddingHorizontal: 20, paddingTop: 60 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowInfo: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 16, fontWeight: '600', color: '#111' },
  rowDesc: { fontSize: 12, color: '#999', marginTop: 2 },
  valueText: { fontSize: 15, color: '#555' },
  freezeBar: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  freezeSlot: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f0f0f0',
  },
  freezeSlotFilled: { backgroundColor: '#60a5fa' },
  freezeCount: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 4 },
  freezeDesc: { fontSize: 12, color: '#999', lineHeight: 18 },
  versionBox: { alignItems: 'center', marginTop: 16 },
  versionTxt: { fontSize: 13, color: '#ccc' },
  langRow: { flexDirection: 'row', gap: 8 },
  langBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  langBtnActive: { backgroundColor: '#111' },
  langBtnTxt: { fontSize: 14, fontWeight: '600', color: '#666' },
  langBtnTxtActive: { color: '#fff' },
})
