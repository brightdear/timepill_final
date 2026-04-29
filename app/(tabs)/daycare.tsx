import React, { useCallback } from 'react'
import { SafeAreaView, StyleSheet } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useDaycare } from '@frontend/hooks/useDaycare'
import { DaycareView } from '@frontend/components/DaycareView'

export default function DaycareScreen() {
  const daycare = useDaycare()
  useFocusEffect(useCallback(() => { daycare.refresh() }, [daycare.refresh]))
  return (
    <SafeAreaView style={styles.safe}>
      <DaycareView {...daycare} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#BDD9EF',
  },
})
