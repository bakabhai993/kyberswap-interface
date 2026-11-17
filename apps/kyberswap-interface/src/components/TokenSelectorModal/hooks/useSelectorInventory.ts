import { ChainId } from '@kyberswap/ks-sdk-core'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { InventoryRow, adaptRow } from 'services/walletInventory'

import { KD_API_URL } from 'constants/env'
import { useEvmBalanceAccount } from 'state/wallet/WalletBalanceContext'
import { INVENTORY_TTL_MS } from 'state/walletInventory/constants'
import { INACTIVE_INVENTORY, WalletInventory } from 'state/walletInventory/resolve'
import { isInventoryChain } from 'state/walletInventory/store'

const EMPTY_ROWS: Record<string, InventoryRow> = {}
const queryKey = (account: string, pool: ChainId | 'uni') => ['token-selector-inventory', account.toLowerCase(), pool]

type InventoryPage = {
  code: number
  message?: string
  data?: {
    balances?: {
      chainId?: number
      tokenAddress: string
      rawAmount: string
      decimals?: number
      symbol?: string
      blockNumber?: number
    }[]
  }
}

/** Each pool trusts its first 1,000 results. Cursor pagination is intentionally not followed. */
export const fetchSelectorInventory = async (account: string, pool: ChainId | 'uni', signal?: AbortSignal) => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, 8_000)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  try {
    const response = await fetch(`${KD_API_URL}/v1/wallets/${pool}/${account}/balances?limit=1000`, {
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Wallet balances responded ${response.status}`)
    const result: InventoryPage = await response.json()
    if (result.code !== 0 || !Array.isArray(result.data?.balances)) {
      throw new Error(result.message || 'Invalid wallet balances response')
    }
    const chains: Record<number, Record<string, InventoryRow>> = {}
    for (const raw of result.data.balances) {
      const chainId = pool === 'uni' ? raw.chainId : pool
      if (chainId === undefined) continue
      const row = adaptRow(chainId, {
        tokenAddress: raw.tokenAddress ?? '',
        rawAmount: raw.rawAmount,
        blockNumber: raw.blockNumber ?? 0,
        decimals: raw.decimals,
        symbol: raw.symbol,
      })
      if (row && row.rawBalance > 0n) (chains[chainId] ??= {})[row.address] = row
    }
    return chains
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

/** All-chain observers share one query; single-chain queries never populate that pool. */
export const useSelectorInventory = (chainId: ChainId, enabled = true, allNetworks = false) => {
  const account = useEvmBalanceAccount()
  const pool = allNetworks ? 'uni' : chainId
  const supported = !!KD_API_URL && (allNetworks || isInventoryChain(chainId))
  const subscribed = enabled && supported && !!account
  const query = useQuery({
    queryKey: queryKey(account ?? '', pool),
    queryFn: ({ signal }) => fetchSelectorInventory(account ?? '', pool, signal),
    enabled: subscribed,
    staleTime: INVENTORY_TTL_MS,
    refetchInterval: INVENTORY_TTL_MS,
    gcTime: 5 * 60_000,
    retry: false,
  })

  return useMemo<WalletInventory & { loading: boolean; allowRpcFallback: boolean }>(
    () => ({
      ...(subscribed && (query.data || query.isError)
        ? { active: true, rows: query.data?.[chainId] ?? EMPTY_ROWS }
        : INACTIVE_INVENTORY),
      loading: subscribed && query.isPending,
      allowRpcFallback: !supported,
    }),
    [subscribed, query.data, query.isError, query.isPending, chainId, supported],
  )
}
