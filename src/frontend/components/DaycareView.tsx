import React from 'react'
import {
  View, Text, Image, StyleSheet,
  ActivityIndicator, ImageSourcePropType,
} from 'react-native'
import type { DaycareStage } from '@shared/constants/daycareConfig'
import type { DaycareState } from '@frontend/hooks/useDaycare'

const STAGE_IMAGES: Record<DaycareStage, ReturnType<typeof require>> = {
  egg:   require('../../../assets/daycare/egg.png'),
  baby:  require('../../../assets/daycare/baby.png'),
  child: require('../../../assets/daycare/child.png'),
  adult: require('../../../assets/daycare/adult.png'),
}

type Props = Pick<DaycareState,
  | 'stage' | 'stageLabel' | 'streak' | 'complianceRate' | 'jellyBalance'
  | 'nextStreakTarget' | 'nextComplianceTarget' | 'nextComplianceDays' | 'loading'
> & {
  background?: ImageSourcePropType | null
  accessory?: ImageSourcePropType | null
}

export function DaycareView({
  stage,
  stageLabel,
  streak,
  complianceRate,
  jellyBalance,
  nextStreakTarget,
  nextComplianceTarget,
  nextComplianceDays,
  loading,
  background = null,
  accessory = null,
}: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {background && (
        <Image source={background} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      <Text style={styles.stageLabel}>{stageLabel}</Text>

      <View style={styles.characterWrapper}>
        <Image
          source={STAGE_IMAGES[stage]}
          style={styles.character}
          resizeMode="contain"
        />
        {accessory && (
          <Image source={accessory} style={styles.accessory} resizeMode="contain" />
        )}
      </View>

      <View style={styles.jellyRow}>
        <Text style={styles.jellyText}>🍬 {jellyBalance}</Text>
      </View>

      <View style={styles.statsBox}>
        <StatRow label="연속 복용" value={`${streak}일`} />
        <StatRow label="복용률" value={`${complianceRate}%`} />
      </View>

      {nextStreakTarget !== null && (
        <View style={styles.nextBox}>
          <Text style={styles.nextTitle}>다음 성장까지</Text>
          <Text style={styles.nextItem}>
            연속 복용 {streak} / {nextStreakTarget}일
          </Text>
          <Text style={styles.nextItem}>
            최근 {nextComplianceDays}일 복용률 {complianceRate}% / {nextComplianceTarget}%
          </Text>
        </View>
      )}

      {nextStreakTarget === null && (
        <Text style={styles.maxStage}>최고 단계 달성!</Text>
      )}
    </View>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    backgroundColor: '#BDD9EF',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#BDD9EF',
  },
  stageLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C4A6B',
    marginBottom: 16,
  },
  characterWrapper: {
    width: 220,
    height: 220,
    marginBottom: 16,
  },
  character: {
    width: '100%',
    height: '100%',
  },
  accessory: {
    ...StyleSheet.absoluteFillObject,
  },
  jellyRow: {
    marginBottom: 16,
  },
  jellyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C4A6B',
  },
  statsBox: {
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 15,
    color: '#2C4A6B',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2C4A6B',
  },
  nextBox: {
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  nextTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A7A9B',
    marginBottom: 4,
  },
  nextItem: {
    fontSize: 13,
    color: '#4A7A9B',
  },
  maxStage: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C4A6B',
    marginTop: 8,
  },
})
