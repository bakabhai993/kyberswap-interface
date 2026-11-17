import { ChainId } from '@kyberswap/ks-sdk-core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { SelectorInventoryFirstPageError, fetchSelectorInventory } from 'services/selectorInventory'
import { InventoryRow } from 'services/walletInventory'

import { KD_API_URL } from 'constants/env'
import { useEvmBalanceAccount } from 'state/wallet/WalletBalanceContext'
import { INVENTORY_TTL_MS } from 'state/walletInventory/constants'
import { INACTIVE_INVENTORY, WalletInventory } from 'state/walletInventory/resolve'
import { getSelectorInventoryCatchup } from 'state/walletInventory/selectorCatchup'
import { isInventoryChain } from 'state/walletInventory/store'

const EMPTY_ROWS: Record<string, InventoryRow> = {}

/** All-chain observers share one query; single-chain queries never populate that pool. */
export const useSelectorInventory = (chainId: ChainId, enabled = true, allNetworks = false) => {
  const account = useEvmBalanceAccount()
  const catchup = getSelectorInventoryCatchup(useQueryClient())
  const pool = allNetworks ? 'uni' : chainId
  const supported = !!KD_API_URL && (allNetworks || isInventoryChain(chainId))
  const subscribed = enabled && supported && !!account
  const query = useQuery({
    queryKey: ['token-selector-inventory', account?.toLowerCase() ?? '', pool],
    queryFn: async ({ signal }) => {
      const snapshot = await fetchSelectorInventory(account ?? '', pool, signal)
      if (signal.aborted) throw new Error('Inventory query cancelled')
      return catchup.merge(account ?? '', pool, snapshot)
    },
    staleTime: INVENTORY_TTL_MS,
    gcTime: 5 * 60_000,
    retry: false,
    enabled: subscribed,
    refetchInterval: INVENTORY_TTL_MS,
  })

  return useMemo<WalletInventory & { loading: boolean; allowRpcFallback: boolean }>(
    () => ({
      ...(subscribed && query.data
        ? { active: true, complete: query.data.complete, rows: query.data.chains[chainId] ?? EMPTY_ROWS }
        : INACTIVE_INVENTORY),
      loading: subscribed && query.isPending,
      allowRpcFallback: subscribed && !query.data && query.error instanceof SelectorInventoryFirstPageError,
    }),
    [subscribed, query.data, query.error, query.isPending, chainId],
  )
}
