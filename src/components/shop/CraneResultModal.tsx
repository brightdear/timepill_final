import React from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { CraneResult } from '@/components/shop/useCraneGame'

type CraneResultModalProps = {
  visible: boolean
  result: CraneResult | null
  canRetry: boolean
  onClose: () => void
  onRetry: () => void
}

function rarityLabel(value?: string) {
  if (value === 'rare') return '레어'
  if (value === 'special') return '스페셜'
  return '일반'
}

export function CraneResultModal({ visible, result, canRetry, onClose, onRetry }: CraneResultModalProps) {
  const success = result?.status === 'success'

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{success ? '획득했어요' : '아쉽게 놓쳤어요'}</Text>
          {success ? (
            <>
              <Text style={styles.emoji}>{result?.prize?.emoji}</Text>
              <Text style={styles.name}>{result?.prize?.name}</Text>
              <Text style={styles.meta}>{result?.prize?.category} · {rarityLabel(result?.prize?.rarity)}</Text>
            </>
          ) : (
            <Text style={styles.failCopy}>다음 타이밍을 천천히 맞춰봐요</Text>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={success ? onClose : onRetry} disabled={!success && !canRetry}>
            <Text style={styles.primaryText}>{success ? '보관함 보기' : '다시 하기'}</Text>
          </TouchableOpacity>
          {success ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={onRetry} disabled={!canRetry}>
              <Text style={[styles.secondaryText, !canRetry && styles.disabledText]}>다시 하기</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryText}>보관함 보기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,19,25,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '800',
    color: '#101319',
  },
  emoji: {
    fontSize: 54,
    lineHeight: 62,
    marginTop: 4,
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
    color: '#8A8F98',
    marginBottom: 8,
  },
  failCopy: {
    minHeight: 76,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: '#8A8F98',
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
    backgroundColor: '#F1F1F3',
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