import React, { useState } from 'react'
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { CRANE_PLAY_COST } from '@/constants/rewards'
import type { CranePrize } from '@/domain/reward/repository'
import { CraneMachine2_5D } from '@/components/shop/CraneMachine2_5D'
import { CraneResultModal } from '@/components/shop/CraneResultModal'
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
    fail: '아쉽게 놓쳤어요',
    start: '크레인 시작',
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
    fail: 'Almost got it',
    start: 'Start',
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
    fail: '惜しくも逃しました',
    start: 'クレーン開始',
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
    case 'fail':
      return copy.fail
    default:
      return copy.ready
  }
}

function buttonLabel(state: CraneGameState, lang: Lang) {
  const copy = CRANE_COPY[lang]
  if (state === 'moving') return copy.down
  if (state === 'dropping' || state === 'closing' || state === 'grabbing' || state === 'lifting' || state === 'carrying' || state === 'droppingToExit' || state === 'dispensing') return copy.moving
  if (state === 'success' || state === 'fail') return copy.retry
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
  const [machineWidth, setMachineWidth] = useState(0)
  const { lang } = useI18n()
  const copy = CRANE_COPY[lang]
  const game = useCraneGameMachine({
    jellyBalance,
    devMode,
    machineWidth,
    machineHeight,
    prizePool,
    onSpendJelly,
    onPrizeWon,
  })

  const handleMachineLayout = (event: LayoutChangeEvent) => {
    setMachineWidth(event.nativeEvent.layout.width)
  }

  const handlePress = () => {
    if (game.state === 'moving') {
      game.dropClaw()
      return
    }

    if (game.state === 'success' || game.state === 'fail') {
      game.closeResult()
      return
    }

    void game.startGame()
  }

  const canPress =
    game.state === 'moving' ||
    game.state === 'success' ||
    game.state === 'fail' ||
    (!game.resolving && game.canStart)
  const disabled = !canPress
  const lackJelly = game.state === 'idle' && !devMode && jellyBalance < CRANE_PLAY_COST

  return (
    <View style={styles.root}>
      <View style={styles.statusRow}>
        <View>
          <Text style={styles.timer}>{game.timer.toFixed(1)}</Text>
          <Text style={styles.status}>{stateLabel(game.state, lang)}</Text>
        </View>
        <View style={styles.costPill}>
          <Text style={styles.costText}>{devMode ? copy.devCost : copy.normalCost}</Text>
        </View>
      </View>

      <CraneMachine2_5D
        height={game.machineHeight}
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
        goalFrame={game.goalFrame}
        prizeObjects={game.prizeObjects}
        attachedPrizeObjectId={game.attachedPrizeObjectId}
        holePrizeObjectId={game.holePrizeObjectId}
        outletPrizeObjectId={game.outletPrizeObjectId}
        state={game.state}
        onLayout={handleMachineLayout}
      />

      <TouchableOpacity style={[styles.button, disabled && styles.buttonDisabled]} onPress={handlePress} disabled={disabled}>
        <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
          {lackJelly ? copy.notEnough : buttonLabel(game.state, lang)}
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
    gap: 16,
  },
  statusRow: {
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: '#FFFDF8',
    borderWidth: 1.5,
    borderColor: '#F1DDB8',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#7B5A18',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  timer: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    color: '#101319',
  },
  status: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: '#8C7755',
  },
  costPill: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: '#FFF2D8',
    borderWidth: 1.5,
    borderColor: '#F7C77A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  costText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    color: '#101319',
  },
  button: {
    height: 64,
    borderRadius: 24,
    backgroundColor: '#FF9F0A',
    borderWidth: 1,
    borderColor: '#F38A05',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B86F00',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
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
    fontWeight: '800',
    color: '#FFFFFF',
  },
  buttonTextDisabled: {
    color: '#8A8F98',
  },
  footerText: {
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
