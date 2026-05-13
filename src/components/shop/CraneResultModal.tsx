import React from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { DayMascotImage } from '@/components/mascot/DayMascotImage'
import { PrizeObjectMini } from '@/components/shop/PrizeObjectView'
import { useI18n } from '@/hooks/useI18n'
import { MASCOT_STATUS_ASSETS, MASCOT_STATUS_DETAILS } from '@/constants/mascotStatus'
import type { CraneResult } from '@/hooks/useCraneGameMachine'

type CraneResultModalProps = {
  visible: boolean
  result: CraneResult | null
  canRetry: boolean
  onClose: () => void
  onRetry: () => void
  onViewInventory: () => void
}

const RESULT_COPY = {
  ko: {
    success: '획득했어요',
    inventory: '보관함 보기',
    retry: '다시 하기',
    close: '닫기',
  },
  en: {
    success: 'Got it',
    inventory: 'View inventory',
    retry: 'Retry',
    close: 'Close',
  },
  ja: {
    success: '獲得しました',
    inventory: '保管箱を見る',
    retry: 'もう一度',
    close: '閉じる',
  },
} as const

export function CraneResultModal({ visible, result, canRetry, onClose, onRetry, onViewInventory }: CraneResultModalProps) {
  const { lang } = useI18n()
  const copy = RESULT_COPY[lang]
  const mascotDetails = MASCOT_STATUS_DETAILS.surprised

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: mascotDetails.surface, borderColor: mascotDetails.border }]}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel={copy.close}>
            <Text style={styles.closeIcon}>×</Text>
          </TouchableOpacity>
          <View style={styles.mascotWrap}>
            <DayMascotImage source={MASCOT_STATUS_ASSETS.surprised} size={88} variant="modal" />
          </View>
          <Text style={styles.title}>{copy.success}</Text>
          <View style={styles.prizePreview}>
            <PrizeObjectMini prize={result?.prize} />
          </View>
          <Text style={styles.name}>{result?.prize?.name}</Text>

          <TouchableOpacity style={styles.primaryButton} onPress={onViewInventory}>
            <Text style={styles.primaryText}>{copy.inventory}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onRetry} disabled={!canRetry}>
            <Text style={[styles.secondaryText, !canRetry && styles.disabledText]}>{copy.retry}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,19,25,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '88%',
    borderRadius: 32,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 8,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#F6F0E6',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    top: 16,
    width: 34,
  },
  mascotWrap: {
    marginTop: 6,
  },
  closeIcon: {
    color: '#8A8F98',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: '#101319',
  },
  prizePreview: {
    alignItems: 'center',
    height: 88,
    justifyContent: 'center',
    marginTop: 2,
    width: 104,
  },
  name: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    color: '#101319',
    marginBottom: 6,
  },
  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 18,
    backgroundColor: '#FF9F0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryButton: {
    width: '100%',
    height: 48,
    borderRadius: 18,
    backgroundColor: '#F6F0E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    color: '#101319',
  },
  disabledText: {
    color: '#8A8F98',
  },
})
