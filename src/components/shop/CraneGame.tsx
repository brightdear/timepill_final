import React, { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { CRANE_PLAY_COST, CRANE_REROLL_COST } from '@/constants/rewards'
import type { CranePrize, CraneRerollResult } from '@/domain/reward/repository'
import { CraneMachine2_5D } from '@/components/shop/CraneMachine2_5D'
import { CraneResultModal } from '@/components/shop/CraneResultModal'
import {
  CRANE_STAGE_HORIZONTAL_MARGIN,
  CRANE_STAGE_MAX_HEIGHT,
  resolveCraneStageSize,
} from '@/components/shop/craneSceneLayout'
import { useI18n } from '@/hooks/useI18n'
import { useCraneGameMachine, type CranePlayStart, type CranePrizeWonInput, type CraneGameState } from '@/hooks/useCraneGameMachine'
import type { Lang } from '@/constants/translations'

type CraneGameProps = {
  jellyBalance: number
  devMode: boolean
  machineHeight?: number
  poolSeed: string
  onSpendJelly: () => Promise<CranePlayStart>
  onPrizeWon: (input: CranePrizeWonInput) => Promise<void>
  onReroll: () => Promise<CraneRerollResult>
  onViewInventory: () => void
  prizePool: CranePrize[]
}

const CRANE_COPY = {
  ko: {
    ready: '6개 풀 준비 완료',
    moving: '위치 조정 중',
    resolving: '집는 중',
    success: '획득 완료',
    play: 'Play Crane',
    drop: 'Drop',
    retry: '다시 시작',
    reroll: 'Reroll',
    playCost: `${CRANE_PLAY_COST}`,
    rerollCost: `${CRANE_REROLL_COST}`,
    pool: '6 rewards',
    notEnoughPlay: '플레이할 젤리가 부족해요',
    notEnoughReroll: '리롤할 젤리가 부족해요',
    devCost: '무료',
  },
  en: {
    ready: '6 rewards ready',
    moving: 'Aim the drop',
    resolving: 'Claw in motion',
    success: 'Prize secured',
    play: 'Play Crane',
    drop: 'Drop',
    retry: 'Reset',
    reroll: 'Reroll',
    playCost: `${CRANE_PLAY_COST}`,
    rerollCost: `${CRANE_REROLL_COST}`,
    pool: '6 rewards',
    notEnoughPlay: 'Not enough jelly to play',
    notEnoughReroll: 'Not enough jelly to reroll',
    devCost: 'Free',
  },
  ja: {
    ready: '6個の景品を表示中',
    moving: '位置調整中',
    resolving: 'クローが動作中',
    success: '獲得完了',
    play: 'Play Crane',
    drop: 'Drop',
    retry: 'リセット',
    reroll: 'Reroll',
    playCost: `${CRANE_PLAY_COST}`,
    rerollCost: `${CRANE_REROLL_COST}`,
    pool: '6 rewards',
    notEnoughPlay: 'プレイ用ゼリーが足りません',
    notEnoughReroll: 'リロール用ゼリーが足りません',
    devCost: '無料',
  },
} as const

function stateLabel(state: CraneGameState, lang: Lang) {
  const copy = CRANE_COPY[lang]
  switch (state) {
    case 'moving':
      return copy.moving
    case 'dropping':
    case 'closing':
    case 'grabbing':
    case 'lifting':
    case 'carrying':
    case 'droppingToExit':
    case 'dispensing':
      return copy.resolving
    case 'success':
      return copy.success
    default:
      return copy.ready
  }
}

function buttonLabel(state: CraneGameState, lang: Lang) {
  const copy = CRANE_COPY[lang]
  if (state === 'moving') return copy.drop
  if (state === 'dropping' || state === 'closing' || state === 'grabbing' || state === 'lifting' || state === 'carrying' || state === 'droppingToExit' || state === 'dispensing') return copy.resolving
  if (state === 'success') return copy.retry
  return copy.play
}

export function CraneGame({
  jellyBalance,
  devMode,
  machineHeight,
  poolSeed,
  onSpendJelly,
  onPrizeWon,
  onReroll,
  onViewInventory,
  prizePool,
}: CraneGameProps) {
  const { width: screenWidth } = useWindowDimensions()
  const { lang } = useI18n()
  const copy = CRANE_COPY[lang]
  const [rerolling, setRerolling] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const stageSize = resolveCraneStageSize(
    screenWidth - CRANE_STAGE_HORIZONTAL_MARGIN,
    machineHeight ?? CRANE_STAGE_MAX_HEIGHT,
  )
  const machineWidth = stageSize.width
  const resolvedMachineHeight = stageSize.height
  const game = useCraneGameMachine({
    jellyBalance,
    devMode,
    machineWidth,
    machineHeight: resolvedMachineHeight,
    poolSeed,
    prizePool,
    onSpendJelly,
    onPrizeWon,
  })

  const handlePress = () => {
    setActionMessage(null)

    if (game.state === 'moving') {
      game.dropClaw()
      return
    }

    if (game.state === 'success') {
      game.retry()
      return
    }

    if (!devMode && jellyBalance < CRANE_PLAY_COST) {
      setActionMessage(copy.notEnoughPlay)
      return
    }

    void game.startGame()
  }

  const handleReroll = async () => {
    if (rerolling || game.resolving || game.state === 'moving') return

    if (!devMode && jellyBalance < CRANE_REROLL_COST) {
      setActionMessage(copy.notEnoughReroll)
      return
    }

    setActionMessage(null)
    setRerolling(true)
    try {
      await onReroll()
      if (game.state === 'success') {
        game.retry()
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : copy.notEnoughReroll)
    } finally {
      setRerolling(false)
    }
  }

  const canPress =
    game.state === 'moving' ||
    game.state === 'success' ||
    (!game.resolving && game.canStart)
  const playDisabled = !canPress || rerolling
  const rerollDisabled = rerolling || game.resolving || game.state === 'moving'
  const message = game.errorMessage ?? actionMessage

  return (
    <View style={styles.root}>
      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>{stateLabel(game.state, lang)}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>{copy.pool}</Text>
        </View>
        <View style={[styles.metaChip, styles.metaChipAccent]}>
          <Text style={[styles.metaChipText, styles.metaChipAccentText]}>{devMode ? copy.devCost : `${jellyBalance}`}</Text>
        </View>
      </View>

      <View style={styles.machineShell}>
        <CraneMachine2_5D
          machineWidth={machineWidth}
          height={resolvedMachineHeight}
          floorTop={game.floorTop}
          floorBottom={game.floorBottom}
          railY={game.railY}
          clawX={game.clawX}
          clawY={game.clawY}
          clawDepthY={game.clawDepthY}
          clawOpen={game.clawOpen}
          clawScale={game.clawScale}
          clawShadow={game.clawShadow}
          attachedPrizeRotation={game.attachedPrizeRotation}
          attachedPrizeOffsetY={game.attachedPrizeOffsetY}
          attachedPrizeOffsetX={game.attachedPrizeOffsetX}
          goalFrame={game.goalFrame}
          prizeObjects={game.prizeObjects}
          attachedPrizeObjectId={game.attachedPrizeObjectId}
          holePrizeObjectId={game.holePrizeObjectId}
          outletPrizeObjectId={game.outletPrizeObjectId}
          state={game.state}
          onLayout={() => undefined}
        />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.primaryButton, playDisabled && styles.buttonDisabled]}
          onPress={handlePress}
          disabled={playDisabled}
        >
          <Text style={[styles.primaryButtonText, playDisabled && styles.buttonTextDisabled]} numberOfLines={1}>
            {buttonLabel(game.state, lang)}
          </Text>
          <Text style={[styles.buttonCostText, playDisabled && styles.buttonTextDisabled]} numberOfLines={1}>
            {devMode ? copy.devCost : copy.playCost}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, rerollDisabled && styles.secondaryButtonDisabled]}
          onPress={() => void handleReroll()}
          disabled={rerollDisabled}
        >
          <Text style={[styles.secondaryButtonText, rerollDisabled && styles.buttonTextDisabled]} numberOfLines={1}>
            {copy.reroll}
          </Text>
          <Text style={[styles.secondaryCostText, rerollDisabled && styles.buttonTextDisabled]} numberOfLines={1}>
            {devMode ? copy.devCost : copy.rerollCost}
          </Text>
        </TouchableOpacity>
      </View>

      {message ? <Text style={styles.errorText}>{message}</Text> : null}

      <CraneResultModal
        visible={game.result !== null}
        result={game.result}
        canRetry={game.canStart}
        onClose={game.dismissResult}
        onRetry={game.retry}
        onViewInventory={onViewInventory}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 12,
    position: 'relative',
    width: '100%',
  },
  metaRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
  },
  metaChip: {
    backgroundColor: '#FFF8EE',
    borderColor: '#EFD9B8',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaChipAccent: {
    backgroundColor: '#FFF2D8',
    borderColor: '#F6CA7D',
    marginLeft: 'auto',
  },
  metaChipText: {
    color: '#73532A',
    fontSize: 12,
    fontWeight: '800',
  },
  metaChipAccentText: {
    color: '#101319',
  },
  machineShell: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#FFFDF9',
    borderColor: '#F0E4D0',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  actionRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1.2,
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: '#FF9F0A',
    borderWidth: 1,
    borderColor: '#F38A05',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#B86F00',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7D7BC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonDisabled: {
    backgroundColor: '#F3EFE8',
    borderColor: '#ECE5DA',
  },
  buttonDisabled: {
    backgroundColor: '#E6DECF',
    borderColor: '#E6DECF',
    shadowOpacity: 0,
  },
  primaryButtonText: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
    color: '#101319',
  },
  buttonCostText: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryCostText: {
    marginTop: 2,
    color: '#8A6B3D',
    fontSize: 12,
    fontWeight: '800',
  },
  buttonTextDisabled: {
    color: '#8A8F98',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: '#B4532A',
    textAlign: 'center',
  },
})
