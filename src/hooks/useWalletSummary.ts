import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { getWalletSummary } from '@/domain/reward/repository'
import type { wallet } from '@/db/schema'

type WalletRow = typeof wallet.$inferSelect

let cachedWalletSummary: WalletRow | null = null

export function useWalletSummary() {
  const [wallet, setWallet] = useState<WalletRow | null>(cachedWalletSummary)
  const [loading, setLoading] = useState(!cachedWalletSummary)

  const load = useCallback(async () => {
    if (!cachedWalletSummary) {
      setLoading(true)
    }

    try {
      const summary = await getWalletSummary()
      cachedWalletSummary = summary
      setWallet(summary)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  return { wallet, loading, reload: load }
}
