import React, { useState } from 'react'
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { CRANE_PLAY_COST } from '@/constants/rewards'
import type { CranePrize } from '@/domain/reward/repository'
import { CraneMachine2_5D } from '@/components/shop/CraneMachine2_5D'
import { CraneResultModal } from '@/components/shop/CraneResultModal'
import { useCraneGameMachine, type CranePlayStart, type CranePrizeWonInput, type CraneGameState } from '@/hooks/useCraneGameMachine'

type CraneGameProps = {
  jellyBalance: number
  devMode: boolean
  machineHeight?: number
  onSpendJelly: () => Promise<CranePlayStart>
  onPrizeWon: (input: CranePrizeWonInput) => Promise<void>
  onViewInventory: () => void
  prizePool: CranePrize[]
}

function stateLabel(state: CraneGameState) {
  switch (state) {
    case 'movingX':
    case 'movingY':
      return '준비됐어요'
    case 'dropping':
    case 'lifting':
      return '움직이는 중'
    case 'grabbing':
      return '집는 중'
    case 'carrying':
    case 'droppingToExit':
      return '옮기는 중'
    case 'success':
      return '획득했어요'
    case 'fail':
      return '아쉽게 놓쳤어요'
    default:
      return '준비됐어요'
  }
}

function buttonLabel(state: CraneGameState) {
  if (state === 'movingX') return '정지'
  if (state === 'movingY') return '내리기'
  if (state === 'dropping' || state === 'grabbing' || state === 'lifting' || state === 'carrying' || state === 'droppingToExit') return '움직이는 중'
  if (state === 'success' || state === 'fail') return '다시 하기'
  return '크레인 시작'
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
    if (game.canLockX) {
      game.beginDepthSelection()
      return
    }

    if (game.canDrop) {
      game.dropClaw()
      return
    }

    void game.startGame()
  }

  const canPress = game.canLockX || game.canDrop || (!game.resolving && game.canStart)
  const disabled = !canPress
  const lackJelly = !devMode && jellyBalance < CRANE_PLAY_COST

  return (
    <View style={styles.root}>
      <View style={styles.statusRow}>
        <View>
          <Text style={styles.timer}>{game.timer.toFixed(1)}</Text>
          <Text style={styles.status}>{stateLabel(game.state)}</Text>
        </View>
        <View style={styles.costPill}>
          <Text style={styles.costText}>{devMode ? '개발 모드 · 무료' : `1회 ${CRANE_PLAY_COST}젤리`}</Text>
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
        state={game.state}
        onLayout={handleMachineLayout}
      />

      <TouchableOpacity style={[styles.button, disabled && styles.buttonDisabled]} onPress={handlePress} disabled={disabled}>
        <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
          {lackJelly ? '젤리가 부족해요' : buttonLabel(game.state)}
        </Text>
      </TouchableOpacity>
      <Text style={styles.footerText}>{devMode ? '개발 모드 · 무료' : `1회 ${CRANE_PLAY_COST}젤리`}</Text>
      {game.errorMessage ? <Text style={styles.errorText}>{game.errorMessage}</Text> : null}

      <CraneResultModal
        visible={game.result !== null}
        result={game.result}
        canRetry={game.canStart}
        onClose={game.closeResult}
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
