import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { designHarness } from '@/design/designHarness'
import { MASCOT_STATUS_DETAILS, formatStreakTitle, getMascotLabel } from '@/constants/mascotStatus'
import { StatusMascot } from '@/components/mascot/StatusMascot'
import { JellyDeltaBadge } from '@/components/jelly/JellyUi'
import { useI18n } from '@/hooks/useI18n'
import { normalizeToastPayload, type ToastInput } from '@/utils/uiEvents'

type AppToastProps = {
  payload: ToastInput | null
  bottom: number
}

export function AppToast({ payload, bottom }: AppToastProps) {
  const { lang } = useI18n()
  if (!payload) return null

  const normalized = normalizeToastPayload(payload)
  const mascotDetails = normalized.mascotKey ? MASCOT_STATUS_DETAILS[normalized.mascotKey] : null
  const message = normalized.mascotKey && normalized.streakCount != null
    ? getMascotLabel(normalized.mascotKey, lang)
    : normalized.message
  const caption = normalized.mascotKey && normalized.streakCount != null
    ? [formatStreakTitle(normalized.streakCount, lang), normalized.caption].filter(Boolean).join(' · ')
    : normalized.caption

  return (
    <View
      style={[
        styles.container,
        { bottom },
        mascotDetails
          ? {
              backgroundColor: mascotDetails.surface,
              borderColor: mascotDetails.border,
            }
          : styles.containerDark,
      ]}
    >
      {normalized.mascotKey ? (
        <StatusMascot framed size={44} statusKey={normalized.mascotKey} />
      ) : null}

      <View style={styles.copy}>
        <Text style={[styles.message, mascotDetails && styles.messageOnLight]} numberOfLines={2}>
          {message}
        </Text>

        {caption || normalized.jellyDelta ? (
          <View style={styles.metaRow}>
            {caption ? (
              <Text style={[styles.caption, mascotDetails && styles.captionOnLight]} numberOfLines={1}>
                {caption}
              </Text>
            ) : null}
            {normalized.jellyDelta ? <JellyDeltaBadge amount={normalized.jellyDelta} compact /> : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    left: 24,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'absolute',
    right: 24,
  },
  containerDark: {
    backgroundColor: '#101319',
    borderColor: 'transparent',
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  messageOnLight: {
    color: '#101319',
  },
  metaRow: {
    alignItems: 'center',
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  caption: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '600',
  },
  captionOnLight: {
    color: designHarness.colors.textSecondary,
  },
})