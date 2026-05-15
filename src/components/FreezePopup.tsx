import React, { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { FreezeEligibleSlot } from '@/hooks/useAppInit'
import { designHarness } from '@/design/designHarness'

interface Props {
  visible: boolean
  slots: FreezeEligibleSlot[]
  freezesRemaining: number
  onConfirm: (selectedSlotIds: string[]) => void
  onDismiss: () => void
}

export function FreezePopup({ visible, slots, freezesRemaining, onConfirm, onDismiss }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (slotId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(slotId)) {
        next.delete(slotId)
      } else if (next.size < freezesRemaining) {
        next.add(slotId)
      }
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selected))
    setSelected(new Set())
  }

  const handleDismiss = () => {
    onDismiss()
    setSelected(new Set())
  }

  if (!visible) return null

  const isSingle = slots.length === 1
  const single = slots[0]

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={s.overlay}>
        <View style={s.box}>
          <Text style={s.icon}>🧊</Text>

          {isSingle ? (
            <Text style={s.body}>
              어제 <Text style={s.bold}>{single?.medName}</Text> 복용을 놓쳤습니다.{'\n'}
              Freeze를 사용하시겠습니까?{'\n'}
              <Text style={s.sub}>(남은 freeze: {freezesRemaining}개)</Text>
            </Text>
          ) : (
            <>
              <Text style={s.body}>
                놓친 약이 {slots.length}개 있습니다.{'\n'}
                어느 약에 Freeze를 사용하시겠습니까?{'\n'}
                <Text style={s.sub}>(남은 freeze: {freezesRemaining}개)</Text>
              </Text>
              <View style={s.list}>
                {slots.map(slot => (
                  <TouchableOpacity
                    key={slot.slotId}
                    style={s.checkRow}
                    onPress={() => toggle(slot.slotId)}
                  >
                    <View style={[s.checkbox, selected.has(slot.slotId) && s.checkboxOn]}>
                      {selected.has(slot.slotId) && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <Text style={s.slotName}>{slot.medName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={s.btnRow}>
            <TouchableOpacity style={s.dismissBtn} onPress={handleDismiss}>
              <Text style={s.dismissTxt}>사용 안 함</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.confirmBtn, isSingle ? s.confirmBtnFull : s.confirmBtnPartial]}
              onPress={isSingle ? () => { onConfirm([single?.slotId ?? '']); setSelected(new Set()) } : handleConfirm}
            >
              <Text style={s.confirmTxt}>사용</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: designHarness.colors.overlayMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    // DESIGN: freeze modal surface and shape. Edit `designHarness.colors.surface` and `designHarness.radius.modal`.
    backgroundColor: designHarness.colors.surface,
    borderRadius: designHarness.radius.modal,
    padding: 24,
    width: 300,
    alignItems: 'center',
    gap: 16,
  },
  icon: { fontSize: 40 },
  body: { fontSize: designHarness.typography.bodySize, color: '#333', textAlign: 'center', lineHeight: 22 },
  bold: { fontWeight: '700', color: designHarness.colors.textStrong },
  sub: { fontSize: designHarness.typography.labelSize, color: designHarness.colors.textMuted },
  list: { width: '100%', gap: 8 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: designHarness.colors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: designHarness.colors.textStrong, backgroundColor: designHarness.colors.textStrong },
  checkmark: { color: designHarness.colors.white, fontSize: designHarness.typography.secondaryBodySize, fontWeight: '700' },
  slotName: { fontSize: designHarness.typography.bodySize, color: designHarness.colors.textStrong },
  btnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  dismissBtn: {
    flex: 1,
    height: 46,
    borderRadius: designHarness.radius.button,
    backgroundColor: designHarness.colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissTxt: { fontSize: designHarness.typography.actionSize, fontWeight: '600', color: designHarness.colors.textSecondary },
  confirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: designHarness.radius.button,
    backgroundColor: designHarness.colors.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnFull: {},
  confirmBtnPartial: {},
  confirmTxt: { fontSize: designHarness.typography.actionSize, fontWeight: '700', color: designHarness.colors.white },
})
