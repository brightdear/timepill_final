import React, { useState } from 'react'
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { CRANE_PLAY_COST } from '@/constants/rewards'
import type { CranePrize } from '@/domain/reward/repository'
import { CraneMachine } from '@/components/shop/CraneMachine'
import { CraneResultModal } from '@/components/shop/CraneResultModal'
import { useCraneGame, type CranePlayStart, type CranePrizeWonInput, type CraneGameState } from '@/components/shop/useCraneGame'

type CraneGameProps = {
  jellyBalance: number
  devMode: boolean
  onSpendJelly: () => Promise<CranePlayStart>
  onPrizeWon: (input: CranePrizeWonInput) => Promise<void>
  prizePool: CranePrize[]
}

function stateLabel(state: CraneGameState) {
  switch (state) {
    case 'moving':
      return '타이밍을 맞춰요'
    case 'dropping':
      return '내려가는 중'
    case 'grabbing':
      return '집는 중'
    case 'lifting':
      return '올리는 중'
    case 'carrying':
    case 'droppingToGoal':
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
  if (state === 'moving') return '내리기'
  if (state === 'dropping' || state === 'grabbing' || state === 'lifting') return '집는 중'
  if (state === 'carrying' || state === 'droppingToGoal') return '옮기는 중'
  return '크레인 시작'
}

export function CraneGame({ jellyBalance, devMode, onSpendJelly, onPrizeWon, prizePool }: CraneGameProps) {
  const [machineWidth, setMachineWidth] = useState(0)
  const game = useCraneGame({
    jellyBalance,
    devMode,
    machineWidth,
    prizePool,
    onSpendJelly,
    onPrizeWon,
  })

  const handleMachineLayout = (event: LayoutChangeEvent) => {
    setMachineWidth(event.nativeEvent.layout.width)
  }

  const handlePress = () => {
    if (game.canDrop) {
      game.dropClaw()
      return
    }

    void game.startGame()
  }

  const canPress = game.canDrop || (!game.resolving && game.canStart)
  const disabled = !canPress

  return (
    <View style={styles.root}>
      <View style={styles.statusRow}>
        <View>
          <Text style={styles.timer}>{game.timer.toFixed(1)}</Text>
          <Text style={styles.status}>{stateLabel(game.state)}</Text>
        </View>
        <View style={styles.costPill}>
          <Text style={styles.costText}>{devMode ? '0젤리' : `${CRANE_PLAY_COST}젤리`}</Text>
        </View>
      </View>

      <CraneMachine
        height={game.machineHeight}
        clawX={game.clawX}
        clawY={game.clawY}
        goalX={game.goalX}
        capsules={game.capsules}
        attachedCapsuleId={game.attachedCapsuleId}
        state={game.state}
        onLayout={handleMachineLayout}
      />

      <TouchableOpacity style={[styles.button, disabled && styles.buttonDisabled]} onPress={handlePress} disabled={disabled}>
        <Text style={styles.buttonText}>{buttonLabel(game.state)}</Text>
      </TouchableOpacity>
      {game.errorMessage ? <Text style={styles.errorText}>{game.errorMessage}</Text> : null}

      <CraneResultModal
        visible={game.result !== null}
        result={game.result}
        canRetry={game.canStart}
        onClose={game.closeResult}
        onRetry={game.retry}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  statusRow: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#FAFAF8',
    borderWidth: 1,
    borderColor: '#F1F1F3',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timer: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    color: '#101319',
  },
  status: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: '#8A8F98',
  },
  costPill: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: '#FFF2D8',
    borderWidth: 1,
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
    height: 52,
    borderRadius: 18,
    backgroundColor: '#FF9F0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#D8D8D8',
  },
  buttonText: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: '#B4532A',
  },
})