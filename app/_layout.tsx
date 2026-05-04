import type { ComponentType } from 'react'
import { isRunningInExpoGo } from 'expo'
import { StyleSheet, Text, View } from 'react-native'
import { translate } from '@/constants/translations'

function ExpoGoFallback() {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>{translate('ko', 'expoGoFallbackTitle')}</Text>
        <Text style={styles.body}>
          {translate('ko', 'expoGoFallbackBody')}
        </Text>
        <Text style={styles.hint}>
          {translate('ko', 'expoGoFallbackHint')}
        </Text>
      </View>
    </View>
  )
}

export default function RootLayout() {
  if (isRunningInExpoGo()) {
    return <ExpoGoFallback />
  }

  const NativeRootLayout = require('../src/components/NativeRootLayout').default as ComponentType
  return <NativeRootLayout />
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FBFAF8',
  },
  card: {
    padding: 22,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  title: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 29,
  },
  body: {
    marginTop: 12,
    color: '#5F5F5F',
    fontSize: 14,
    lineHeight: 21,
  },
  hint: {
    marginTop: 18,
    color: '#F27A1A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
})
