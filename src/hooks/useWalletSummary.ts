import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { getWalletSummary } from '@/domain/reward/repository'
import type { wallet } from '@/db/schema'

type WalletRow = typeof wallet.$inferSelect

export function useWalletSummary() {
  const [wallet, setWallet] = useState<WalletRow | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setWallet(await getWalletSummary())
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  return { wallet, loading, reload: load }
}