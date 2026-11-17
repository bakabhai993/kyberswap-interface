import { ChainId } from '@kyberswap/ks-sdk-core'
import { QueryClient } from '@tanstack/react-query'
import type { SelectorInventorySnapshot } from 'services/selectorInventory'
import { InventoryRow, fetchWalletLiveBalances } from 'services/walletInventory'

import { INVENTORY_CATCHUP_INTERVAL_MS } from './constants'

// Selector policy: a fixed live window, not an indexer catch-up deadline.
// At expiry the API wins even if stale; do not extend this based on pool agreement.
const LIVE_WINDOW_MS = 120_000
type Watch = {
  chainId: ChainId
  account: string
  tokens: Map<string, { block?: number; row?: InventoryRow }>
  controller?: AbortController
  timer?: ReturnType<typeof setTimeout>
  deadline?: ReturnType<typeof setTimeout>
}

/** Owns only the bounded live refresh. Each selector query owns its indexed snapshot. */
export class SelectorInventoryCatchup {
  private watches = new Map<string, Watch>()
  constructor(private client: QueryClient) {}

  private filters(watch: Pick<Watch, 'chainId' | 'account'>) {
    return {
      queryKey: ['token-selector-inventory', watch.account.toLowerCase()],
      predicate: (query: { queryKey: readonly unknown[] }) =>
        query.queryKey[2] === 'uni' || query.queryKey[2] === watch.chainId,
    }
  }

  private stop(key: string, watch: Watch) {
    watch.controller?.abort()
    clearTimeout(watch.timer)
    clearTimeout(watch.deadline)
    this.watches.delete(key)
  }

  start(chainId: ChainId, account: string, block: number | undefined, addresses: readonly string[]) {
    if (!addresses.length) return
    account = account.toLowerCase()
    const key = `${chainId}:${account}`
    const previous = this.watches.get(key)
    // A new confirmation restarts this wallet/chain window and retains its affected tokens.
    const tokens = new Map(previous?.tokens)
    if (previous) this.stop(key, previous)
    addresses.forEach(address => {
      address = address.toLowerCase()
      const token = tokens.get(address)
      tokens.set(address, {
        row: token?.row,
        block: block === undefined ? token?.block : Math.max(block, token?.block ?? block),
      })
    })
    const watch: Watch = { chainId, account, tokens }
    this.watches.set(key, watch)
    // Independent of request completion: even a stalled live read cannot extend the window.
    watch.deadline = setTimeout(() => {
      // Deliberately release protection before refetching: an older API amount is valid now.
      this.stop(key, watch)
      void this.refresh(watch.chainId, watch.account)
    }, LIVE_WINDOW_MS)
    void this.client.cancelQueries(this.filters(watch), { revert: false }).then(async () => {
      if (this.watches.get(key) !== watch) return
      await this.poll(key, watch)
      if (this.watches.get(key) === watch) void this.client.invalidateQueries(this.filters(watch))
    })
  }

  // Inactive pools are marked stale for reopening; refresh failure keeps the cached balance.
  async refresh(chainId: ChainId, account: string) {
    const filters = this.filters({ chainId, account })
    // Live patches may have landed after the indexed request started. Keep them on cancellation.
    await this.client.cancelQueries(filters, { revert: false })
    await this.client.invalidateQueries(filters)
  }

  /** Apply live rows only while the confirmation window exists; no pool acknowledgement needed. */
  merge(account: string, pool: number | 'uni', snapshot: SelectorInventorySnapshot): SelectorInventorySnapshot {
    let chains = snapshot.chains
    for (const watch of this.watches.values()) {
      if (watch.account !== account.toLowerCase() || (pool !== 'uni' && pool !== watch.chainId)) continue
      const rows = { ...chains[watch.chainId] }
      for (const { row } of watch.tokens.values()) {
        if (!row) continue
        const indexed = rows[row.address]
        // Single-chain indexed rows can already be newer than the last live read.
        if (indexed && indexed.blockNumber > row.blockNumber) continue
        rows[row.address] = {
          ...row,
          decimals: row.decimals ?? indexed?.decimals,
          symbol: row.symbol ?? indexed?.symbol,
        }
      }
      chains = { ...chains, [watch.chainId]: rows }
    }
    return chains === snapshot.chains ? snapshot : { ...snapshot, chains }
  }

  private async poll(key: string, watch: Watch) {
    const controller = new AbortController()
    watch.controller = controller
    try {
      const rows = await fetchWalletLiveBalances(
        watch.chainId,
        watch.account,
        [...watch.tokens.keys()],
        controller.signal,
      )
      if (controller.signal.aborted || this.watches.get(key) !== watch) return
      for (const row of rows) {
        const token = watch.tokens.get(row.address.toLowerCase())
        if (!token || row.blockNumber < Math.max(token.block ?? 0, token.row?.blockNumber ?? 0)) continue
        token.row = row
      }
      for (const query of this.client.getQueryCache().findAll(this.filters(watch))) {
        this.client.setQueryData<SelectorInventorySnapshot>(
          query.queryKey,
          old => (old ? this.merge(watch.account, query.queryKey[2] as number | 'uni', old) : old),
          // A live patch does not renew the indexed snapshot's freshness.
          { updatedAt: query.state.dataUpdatedAt },
        )
      }
    } catch {
      // Retain the last successful balance; retries stop at the same deadline.
    } finally {
      if (!controller.signal.aborted && this.watches.get(key) === watch) {
        watch.timer = setTimeout(() => void this.poll(key, watch), INVENTORY_CATCHUP_INTERVAL_MS)
      }
    }
  }

  dispose() {
    for (const [key, watch] of this.watches) this.stop(key, watch)
  }
}

const owners = new WeakMap<QueryClient, SelectorInventoryCatchup>()
export const getSelectorInventoryCatchup = (client: QueryClient) => {
  let owner = owners.get(client)
  if (!owner) {
    owner = new SelectorInventoryCatchup(client)
    owners.set(client, owner)
  }
  return owner
}
