import { InventoryRawRow, UnsupportedChainError, parseRawAmount, walkWalletInventory } from '@kyber/hooks'
import { ChainId } from '@kyberswap/ks-sdk-core'
import { z } from 'zod'

import { KD_API_URL } from 'constants/env'
import { ETHER_ADDRESS } from 'constants/index'
import { isAddress } from 'utils/address'

export { UnsupportedChainError, parseRawAmount }

/** One token the wallet holds, as the rest of the app consumes it. */
export type InventoryRow = {
  /** Checksummed. The API's native sentinel is normalized to `ETHER_ADDRESS`. */
  address: string
  /** On-chain units; zero when a live read found the token emptied. Divide by `decimals` only at display time. */
  rawBalance: bigint
  /** Block at which this token's balance last changed — per token, not a snapshot of the response. */
  blockNumber: number
  /** Only present for tokens the catalog knows; absent for unknown / spam holdings. */
  decimals?: number
  symbol?: string
}

export type WalletInventoryResult = {
  rows: InventoryRow[]
  /**
   * False when the walk stopped before reaching the end (page cap hit). A partial inventory can never
   * be read as "every other token is zero" — it only proves the tokens it does list are held.
   */
  complete: boolean
  /**
   * How far the index has caught up to the chain. Live reads are excluded on purpose: they are
   * stamped at the head, and a caller waiting out the indexer's lag would otherwise stop waiting the
   * moment it asked for one.
   */
  blockNumber: number
}

// Metadata is omitted per row for tokens the catalog does not know, so all of it is optional.
const rowSchema = z.object({
  tokenAddress: z.string(),
  rawAmount: z.string(),
  blockNumber: z.number(),
  decimals: z.number().optional(),
  symbol: z.string().optional(),
})

/**
 * Every consumer keys balances by the checksummed `Token.address`, so an un-normalized (lowercase) key
 * would miss every lookup silently — the comparator would fall back to a symbol sort and held
 * whitelist tokens would duplicate into the "in your wallet" group. The native sentinel is matched
 * case-insensitively for the same reason.
 */
const normalizeAddress = (chainId: ChainId, address: string): string | undefined => {
  if (address.toLowerCase() === ETHER_ADDRESS.toLowerCase()) return ETHER_ADDRESS
  return isAddress(chainId, address) || undefined
}

export const adaptRow = (chainId: ChainId, raw: InventoryRawRow): InventoryRow | undefined => {
  const address = normalizeAddress(chainId, raw.tokenAddress)
  if (!address) return undefined
  return {
    address,
    rawBalance: parseRawAmount(raw.rawAmount),
    blockNumber: raw.blockNumber,
    decimals: raw.decimals,
    symbol: raw.symbol || undefined,
  }
}

/**
 * Every token the wallet holds on one chain, walked to completion by the shared client and adapted
 * to the app's checksummed row shape. Rows the service returns malformed are dropped rather than
 * poisoning the map. Zero rows are kept: a live read reporting a token emptied is a fact stamped at
 * the head, and the store needs it to outrank the index's lagging amount until the index catches up.
 */
export const fetchWalletInventory = async ({
  chainId,
  account,
  signal,
  liveAddrs,
  onPageFetched,
}: {
  chainId: ChainId
  account: string
  signal?: AbortSignal
  /** Tokens the service should read from the node as it answers; see `walkWalletInventory`. */
  liveAddrs?: readonly string[]
  onPageFetched?: () => void
}): Promise<WalletInventoryResult> => {
  if (!KD_API_URL) throw new Error('wallet inventory host is not configured')

  const {
    rows: raw,
    complete,
    indexedBlock,
  } = await walkWalletInventory({
    baseUrl: KD_API_URL,
    chainId,
    account,
    signal,
    liveAddrs,
    onPageFetched,
  })

  const rows: InventoryRow[] = []

  raw.forEach(candidate => {
    if (!rowSchema.safeParse(candidate).success) return
    const row = adaptRow(chainId, candidate)
    if (row) rows.push(row)
  })

  return { rows, complete, blockNumber: indexedBlock }
}

/** Only read the affected tokens from the node; do not walk the wallet for a live refresh. */
export const fetchWalletLiveBalances = async (
  chainId: ChainId,
  account: string,
  addresses: readonly string[],
  signal?: AbortSignal,
): Promise<InventoryRow[]> => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, 8_000)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  try {
    const params = new URLSearchParams({ limit: '1' })
    new Set(addresses.map(address => address.toLowerCase())).forEach(address => params.append('liveAddrs', address))
    const response = await fetch(`${KD_API_URL}/v1/wallets/${chainId}/${account}/balances?${params}`, {
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Wallet live balances responded ${response.status}`)
    const result = await response.json()
    if (result.code !== 0 || !Array.isArray(result.data?.liveBalances)) {
      throw new Error('Invalid wallet live balances response')
    }

    return result.data.liveBalances.flatMap((raw: unknown) => {
      const parsed = rowSchema.safeParse(raw)
      if (!parsed.success) return []
      const row = adaptRow(chainId, parsed.data)
      return row ? [row] : []
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
