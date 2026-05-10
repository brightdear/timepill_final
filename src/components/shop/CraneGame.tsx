import React, { useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { CRANE_PLAY_COST } from '@/constants/rewards'
import type { CranePrize } from '@/domain/reward/repository'
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
  onSpendJelly: () => Promise<CranePlayStart>
  onPrizeWon: (input: CranePrizeWonInput) => Promise<void>
  onViewInventory: () => void
  prizePool: CranePrize[]
}

const CRANE_COPY = {
  ko: {
    ready: '준비됐어요',
    moving: '움직이는 중',
    grabbing: '집는 중',
    carrying: '옮기는 중',
    success: '획득했어요',
    start: 'Jelly x1 투입',
    inserting: '젤리 투입 중',
    insertToken: 'Jelly x1',
    down: '∨ 내리기',
    retry: '다시 하기',
    notEnough: '젤리가 부족해요',
    devCost: '개발 모드 · 무료',
    normalCost: `1회 ${CRANE_PLAY_COST}젤리`,
  },
  en: {
    ready: 'Ready',
    moving: 'Moving',
    grabbing: 'Grabbing',
    carrying: 'Carrying',
    success: 'Got it',
    start: 'Insert Jelly x1',
    inserting: 'Inserting jelly',
    insertToken: 'Jelly x1',
    down: '∨ Down',
    retry: 'Retry',
    notEnough: 'Not enough jelly',
    devCost: 'Dev mode · Free',
    normalCost: `${CRANE_PLAY_COST} jellies`,
  },
  ja: {
    ready: '準備完了',
    moving: '移動中',
    grabbing: 'つかみ中',
    carrying: '運び中',
    success: '獲得しました',
    start: 'Jelly x1 投入',
    inserting: 'ゼリー投入中',
    insertToken: 'Jelly x1',
    down: '∨ 下ろす',
    retry: 'もう一度',
    notEnough: 'ゼリーが足りません',
    devCost: '開発モード · 無料',
    normalCost: `1回 ${CRANE_PLAY_COST}ゼリー`,
  },
} as const

function stateLabel(state: CraneGameState, lang: Lang) {
  const copy = CRANE_COPY[lang]
  switch (state) {
    case 'moving':
    case 'dropping':
    case 'lifting':
      return copy.moving
    case 'closing':
    case 'grabbing':
      return copy.grabbing
    case 'carrying':
    case 'droppingToExit':
    case 'dispensing':
      return copy.carrying
    case 'success':
      return copy.success
    default:
      return copy.ready
  }
}

function buttonLabel(state: CraneGameState, lang: Lang) {
  const copy = CRANE_COPY[lang]
  if (state === 'moving') return copy.down
  if (state === 'dropping' || state === 'closing' || state === 'grabbing' || state === 'lifting' || state === 'carrying' || state === 'droppingToExit' || state === 'dispensing') return copy.moving
  if (state === 'success') return copy.retry
  return copy.start
}

export function CraneGame({
  jellyBalance,
  devMode,
  machineHeight,
  onSpendJelly,
  onPrizeWon,
  onViewInventory,
  prizePool,
}: CraneGameProps) {
  const { width: screenWidth } = useWindowDimensions()
  const { lang } = useI18n()
  const copy = CRANE_COPY[lang]
  const [isInsertingJelly, setIsInsertingJelly] = useState(false)
  const insertProgress = useRef(new Animated.Value(0)).current
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
    prizePool,
    onSpendJelly,
    onPrizeWon,
  })
  const timerProgress = Math.max(0, Math.min(1, game.timer / 10))
  const insertTranslateY = insertProgress.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [44, 2, 8],
  })
  const insertTranslateX = insertProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [72, 0],
  })
  const insertOpacity = insertProgress.interpolate({
    inputRange: [0, 0.12, 0.78, 1],
    outputRange: [0, 1, 1, 0],
  })
  const insertScale = insertProgress.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [0.88, 1.05, 0.72],
  })
  const insertRotate = insertProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-10deg', '10deg'],
  })

  const handlePress = () => {
    if (isInsertingJelly) return

    if (game.state === 'moving') {
      game.dropClaw()
      return
    }

    if (game.state === 'success') {
      game.retry()
      return
    }

    setIsInsertingJelly(true)
    insertProgress.setValue(0)
    Animated.timing(insertProgress, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      void game.startGame().finally(() => setIsInsertingJelly(false))
    })
  }

  const canPress =
    game.state === 'moving' ||
    game.state === 'success' ||
    (!game.resolving && game.canStart)
  const disabled = !canPress || isInsertingJelly
  const lackJelly = game.state === 'idle' && !devMode && jellyBalance < CRANE_PLAY_COST

  return (
    <View style={styles.root}>
      <View style={styles.statusRow}>
        <View style={styles.timerPanel}>
          <View style={styles.timerTopLine}>
            <Text style={styles.timerLabel}>TIME</Text>
            <Text style={styles.timer}>{game.timer.toFixed(1)}</Text>
          </View>
          <View style={styles.timerTrack}>
            <View style={[styles.timerFill, { width: `${timerProgress * 100}%` }]} />
          </View>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.status}>{isInsertingJelly ? copy.inserting : stateLabel(game.state, lang)}</Text>
        </View>
        <View style={styles.costPill}>
          <Text style={styles.costText}>{devMode ? copy.devCost : copy.normalCost}</Text>
        </View>
      </View>

      {isInsertingJelly ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.insertToken,
            {
              opacity: insertOpacity,
              transform: [
                { translateX: insertTranslateX },
                { translateY: insertTranslateY },
                { rotate: insertRotate },
                { scale: insertScale },
              ],
            },
          ]}
        >
          <View style={styles.insertTokenCoin} />
          <Text style={styles.insertTokenText}>{copy.insertToken}</Text>
        </Animated.View>
      ) : null}

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

      <TouchableOpacity style={[styles.button, disabled && styles.buttonDisabled]} onPress={handlePress} disabled={disabled}>
        <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
          {lackJelly ? copy.notEnough : isInsertingJelly ? copy.inserting : buttonLabel(game.state, lang)}
        </Text>
      </TouchableOpacity>
      <Text style={styles.footerText}>{devMode ? copy.devCost : copy.normalCost}</Text>
      {game.errorMessage ? <Text style={styles.errorText}>{game.errorMessage}</Text> : null}

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
  },
  statusRow: {
    alignSelf: 'stretch',
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#F1DDB8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timerPanel: {
    flex: 1,
    gap: 7,
    minWidth: 112,
  },
  timerTopLine: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
  },
  timerLabel: {
    color: '#B7924B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  timer: {
    fontSize: 26,
    lineHeight: 29,
    fontWeight: '700',
    color: '#101319',
  },
  timerTrack: {
    backgroundColor: '#F0E3C9',
    borderRadius: 999,
    height: 6,
    overflow: 'hidden',
  },
  timerFill: {
    backgroundColor: '#FF9F0A',
    borderRadius: 999,
    height: 6,
  },
  statusPill: {
    alignItems: 'center',
    backgroundColor: '#F6EFE3',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 10,
  },
  status: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#8C7755',
  },
  costPill: {
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: '#FFF2D8',
    borderWidth: 1.5,
    borderColor: '#F7C77A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  costText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#101319',
  },
  insertToken: {
    alignItems: 'center',
    backgroundColor: '#FFF8E7',
    borderColor: '#F4C66D',
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    right: 34,
    top: 74,
    zIndex: 80,
    shadowColor: '#9C6416',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  insertTokenCoin: {
    backgroundColor: '#FFB53E',
    borderColor: '#FFE2A6',
    borderRadius: 999,
    borderWidth: 2,
    height: 18,
    width: 18,
  },
  insertTokenText: {
    color: '#101319',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },
  button: {
    alignSelf: 'stretch',
    height: 60,
    borderRadius: 24,
    backgroundColor: '#FF9F0A',
    borderWidth: 1,
    borderColor: '#F38A05',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B86F00',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  buttonDisabled: {
    backgroundColor: '#E6DECf',
    borderColor: '#E6DECF',
    shadowOpacity: 0,
  },
  buttonText: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  buttonTextDisabled: {
    color: '#8A8F98',
  },
  footerText: {
    alignSelf: 'stretch',
    color: '#8C7755',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: '#B4532A',
    textAlign: 'center',
  },
})
