import { ChainId } from '@kyberswap/ks-sdk-core'
import { InventoryRow, adaptRow, fetchWalletInventory } from 'services/walletInventory'

import { KD_API_URL } from 'constants/env'

export type SelectorInventorySnapshot = {
  chains: Record<number, Record<string, InventoryRow>>
  complete: boolean
}

const ALL_NETWORKS_VALUE_THRESHOLD_USD = 0.1
const MAX_PAGES = 10

export class SelectorInventoryFirstPageError extends Error {}

type InventoryPage = {
  code: number
  message?: string
  data?: {
    nextCursor?: string | null
    balances?: {
      valueUsd?: number
      chainId?: number
      tokenAddress: string
      rawAmount: string
      decimals?: number
      symbol?: string
      blockNumber?: number
    }[]
  }
}

/** Each page has its own timeout; a failed walk never replaces a cached snapshot. */
const fetchPage = async (url: string, signal?: AbortSignal): Promise<InventoryPage> => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, 8_000)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`Wallet balances responded ${response.status}`)
    const result: InventoryPage = await response.json()
    if (result.code !== 0 || !Array.isArray(result.data?.balances)) {
      throw new Error(result.message || 'Invalid wallet balances response')
    }
    return result
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

const fetchInventory = async (
  account: string,
  pool: ChainId | 'uni',
  signal: AbortSignal | undefined,
  onPageFetched: () => void,
): Promise<SelectorInventorySnapshot> => {
  const chains: Record<number, Record<string, InventoryRow>> = {}
  if (pool !== 'uni') {
    // Per-chain rows are ordered by block/address, so use the existing complete inventory walk.
    const inventory = await fetchWalletInventory({ chainId: pool, account, signal, onPageFetched })
    for (const row of inventory.rows) {
      if (row.rawBalance >= 0n) (chains[pool] ??= {})[row.address] = row
    }

    return { chains, complete: inventory.complete }
  }

  let cursor: string | undefined
  let complete = true
  const cursors = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: '1000' })
    if (cursor) params.set('cursor', cursor)
    const result = await fetchPage(`${KD_API_URL}/v1/wallets/uni/${account}/balances?${params}`, signal)
    onPageFetched()
    const rows = result.data?.balances ?? []

    for (const raw of rows) {
      if (raw.chainId === undefined) continue
      const row = adaptRow(raw.chainId, {
        tokenAddress: raw.tokenAddress ?? '',
        rawAmount: raw.rawAmount,
        blockNumber: raw.blockNumber ?? 0,
        decimals: raw.decimals,
        symbol: raw.symbol,
      })
      if (row && row.rawBalance >= 0n) (chains[raw.chainId] ??= {})[row.address] = row
    }
    // Keep the entire page; USD value only controls whether another page is needed.
    const belowThreshold = rows.some(
      row => typeof row.valueUsd === 'number' && row.valueUsd < ALL_NETWORKS_VALUE_THRESHOLD_USD,
    )
    const nextCursor = result.data?.nextCursor

    if (!rows.length || !nextCursor) break

    if (belowThreshold || page === MAX_PAGES - 1) {
      complete = false
      break
    }
    if (cursors.has(nextCursor)) throw new Error('Wallet balances cursor did not advance')
    cursors.add(nextCursor)
    cursor = nextCursor
  }
  return { chains, complete }
}

/** Only a failed first page permits RPC fallback; cancellation never does. */
export const fetchSelectorInventory = async (
  account: string,
  pool: ChainId | 'uni',
  signal?: AbortSignal,
): Promise<SelectorInventorySnapshot> => {
  let fetchedPage = false
  try {
    return await fetchInventory(account, pool, signal, () => {
      fetchedPage = true
    })
  } catch (error) {
    if (!fetchedPage && !signal?.aborted) {
      throw new SelectorInventoryFirstPageError(error instanceof Error ? error.message : 'Inventory first page failed')
    }
    throw error
  }
}
