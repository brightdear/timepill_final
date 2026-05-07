import React from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { PrizeObjectMini } from '@/components/shop/PrizeObjectView'
import { useI18n } from '@/hooks/useI18n'
import type { Lang } from '@/constants/translations'
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
    fail: '아쉽게 놓쳤어요',
    failCopy: '다음 타이밍을 천천히 맞춰봐요',
    inventory: '보관함 보기',
    retry: '다시 하기',
    close: '닫기',
    common: '일반',
    rare: '레어',
    special: '스페셜',
    reward: '보상',
    categories: {
      keyring: '키링',
      keycap: '키캡',
      squishy: '말랑이',
      sticker: '스티커',
      badge: '배지',
      theme: '테마',
    },
  },
  en: {
    success: 'Got it',
    fail: 'Almost got it',
    failCopy: 'Try the timing slowly next round.',
    inventory: 'View inventory',
    retry: 'Retry',
    close: 'Close',
    common: 'Common',
    rare: 'Rare',
    special: 'Special',
    reward: 'Reward',
    categories: {
      keyring: 'Keyring',
      keycap: 'Keycap',
      squishy: 'Squishy',
      sticker: 'Sticker',
      badge: 'Badge',
      theme: 'Theme',
    },
  },
  ja: {
    success: '獲得しました',
    fail: '惜しくも逃しました',
    failCopy: '次はゆっくりタイミングを合わせましょう',
    inventory: '保管箱を見る',
    retry: 'もう一度',
    close: '閉じる',
    common: '一般',
    rare: 'レア',
    special: 'スペシャル',
    reward: '報酬',
    categories: {
      keyring: 'キーリング',
      keycap: 'キーキャップ',
      squishy: 'スクイーズ',
      sticker: 'ステッカー',
      badge: 'バッジ',
      theme: 'テーマ',
    },
  },
} as const

function rarityLabel(value: string | undefined, lang: Lang) {
  const copy = RESULT_COPY[lang]
  if (value === 'rare') return copy.rare
  if (value === 'special') return copy.special
  return copy.common
}

function categoryLabel(value: string | undefined, lang: Lang) {
  const copy = RESULT_COPY[lang]
  if (value === 'keyring' || value === 'keycap' || value === 'squishy' || value === 'sticker' || value === 'badge' || value === 'theme') {
    return copy.categories[value]
  }
  return copy.reward
}

export function CraneResultModal({ visible, result, canRetry, onClose, onRetry, onViewInventory }: CraneResultModalProps) {
  const { lang } = useI18n()
  const copy = RESULT_COPY[lang]
  const success = result?.status === 'success'

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel={copy.close}>
            <Text style={styles.closeIcon}>×</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{success ? copy.success : copy.fail}</Text>
          {success ? (
            <>
              <View style={styles.prizePreview}>
                <PrizeObjectMini prize={result?.prize} />
              </View>
              <Text style={styles.name}>{result?.prize?.name}</Text>
              <Text style={styles.meta}>{categoryLabel(result?.prize?.category, lang)} · {rarityLabel(result?.prize?.rarity, lang)}</Text>
            </>
          ) : (
            <Text style={styles.failCopy}>{copy.failCopy}</Text>
          )}

          {success ? (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={onViewInventory}>
                <Text style={styles.primaryText}>{copy.inventory}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={onRetry} disabled={!canRetry}>
                <Text style={[styles.secondaryText, !canRetry && styles.disabledText]}>{copy.retry}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tertiaryButton} onPress={onClose}>
                <Text style={styles.tertiaryText}>{copy.close}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.primaryButton, !canRetry && styles.primaryButtonDisabled]} onPress={onRetry} disabled={!canRetry}>
                <Text style={[styles.primaryText, !canRetry && styles.disabledPrimaryText]}>{copy.retry}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryText}>{copy.close}</Text>
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
