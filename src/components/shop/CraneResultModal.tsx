import React from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { PrizeObjectMini } from '@/components/shop/PrizeObjectView'
import type { CraneResult } from '@/hooks/useCraneGameMachine'

type CraneResultModalProps = {
  visible: boolean
  result: CraneResult | null
  canRetry: boolean
  onClose: () => void
  onRetry: () => void
  onViewInventory: () => void
}

function rarityLabel(value?: string) {
  if (value === 'rare') return '레어'
  if (value === 'special') return '스페셜'
  return '일반'
}

function categoryLabel(value?: string) {
  if (value === 'keyring') return '키링'
  if (value === 'keycap') return '키캡'
  if (value === 'squishy') return '말랑이'
  if (value === 'sticker') return '스티커'
  if (value === 'badge') return '배지'
  if (value === 'theme') return '테마'
  return '보상'
}

export function CraneResultModal({ visible, result, canRetry, onClose, onRetry, onViewInventory }: CraneResultModalProps) {
  const success = result?.status === 'success'

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel="닫기">
            <Text style={styles.closeIcon}>×</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{success ? '획득했어요' : '아쉽게 놓쳤어요'}</Text>
          {success ? (
            <>
              <View style={styles.prizePreview}>
                <PrizeObjectMini prize={result?.prize} />
              </View>
              <Text style={styles.name}>{result?.prize?.name}</Text>
              <Text style={styles.meta}>{categoryLabel(result?.prize?.category)} · {rarityLabel(result?.prize?.rarity)}</Text>
            </>
          ) : (
            <Text style={styles.failCopy}>다음 타이밍을 천천히 맞춰봐요</Text>
          )}

          {success ? (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={onViewInventory}>
                <Text style={styles.primaryText}>보관함 보기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={onRetry} disabled={!canRetry}>
                <Text style={[styles.secondaryText, !canRetry && styles.disabledText]}>다시 하기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tertiaryButton} onPress={onClose}>
                <Text style={styles.tertiaryText}>닫기</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.primaryButton, !canRetry && styles.primaryButtonDisabled]} onPress={onRetry} disabled={!canRetry}>
                <Text style={[styles.primaryText, !canRetry && styles.disabledPrimaryText]}>다시 하기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryText}>닫기</Text>
              </TouchableOpacity>
            </>
          )}
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
    width: '90%',
    borderRadius: 32,
    backgroundColor: '#FFFCF7',
    borderWidth: 1,
    borderColor: '#F2E5D0',
    paddingHorizontal: 28,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#7B5A18',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
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
  closeIcon: {
    color: '#8A8F98',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  title: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
    color: '#101319',
    marginTop: 12,
  },
  prizePreview: {
    alignItems: 'center',
    height: 86,
    justifyContent: 'center',
    marginTop: 4,
    width: 100,
  },
  name: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    color: '#101319',
  },
  meta: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: '#8C7755',
    marginBottom: 8,
  },
  failCopy: {
    minHeight: 76,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: '#8C7755',
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
  primaryButtonDisabled: {
    backgroundColor: '#D8D8D8',
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
  disabledPrimaryText: {
    color: '#FFFFFF',
    opacity: 0.62,
  },
  tertiaryButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: '100%',
  },
  tertiaryText: {
    color: '#8C7755',
    fontSize: 14,
    fontWeight: '800',
  },
})
