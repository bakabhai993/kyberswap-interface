import { QueryClient, QueryObserver } from '@tanstack/react-query'
import type { SelectorInventorySnapshot } from 'services/selectorInventory'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { SelectorInventoryCatchup } from './selectorCatchup'

const live = vi.hoisted(() => vi.fn())
vi.mock('services/walletInventory', () => ({ fetchWalletLiveBalances: live }))
const address = '0x0000000000000000000000000000000000000001'
const row = (amount = 60n, blockNumber = 100) => ({ address, rawBalance: amount, blockNumber })
const snapshot = (amount = 100n, block = 90): SelectorInventorySnapshot => ({
  complete: true,
  chains: { 1: { [address]: row(amount, block) } },
})
const key = (pool: 1 | 'uni') => ['token-selector-inventory', 'wallet', pool]
let client: QueryClient
let owner: SelectorInventoryCatchup
beforeEach(() => {
  vi.useFakeTimers()
  client = new QueryClient()
  owner = new SelectorInventoryCatchup(client)
  live.mockResolvedValue([row()])
  client.setQueryData(key(1), snapshot())
  client.setQueryData(key('uni'), snapshot())
})
afterEach(() => {
  owner.dispose()
  client.clear()
  vi.useRealTimers()
  vi.resetAllMocks()
})
const flush = () => vi.advanceTimersByTimeAsync(0)

it.each([0n, 60n])('protects balance %s in both independent pools only for 120 seconds', async amount => {
  live.mockResolvedValue([row(amount)])
  owner.start(1, 'WALLET', 100, [address])
  await flush()
  const old = snapshot()
  for (const pool of [1, 'uni'] as const) {
    expect(client.getQueryData<SelectorInventorySnapshot>(key(pool))?.chains[1][address].rawBalance).toBe(amount)
    expect(owner.merge('wallet', pool, old).chains[1][address].rawBalance).toBe(amount)
    expect(owner.merge('wallet', pool, { chains: {}, complete: false }).chains[1][address].rawBalance).toBe(amount)
  }
  expect(owner.merge('other', 'uni', old)).toBe(old)
  expect(owner.merge('wallet', 56, old)).toBe(old)
  await vi.advanceTimersByTimeAsync(119_999)
  expect(owner.merge('wallet', 'uni', old).chains[1][address].rawBalance).toBe(amount)
  await vi.advanceTimersByTimeAsync(1)
  expect(owner.merge('wallet', 'uni', old)).toBe(old)
  await vi.advanceTimersByTimeAsync(600_000)
  expect(live).toHaveBeenCalledTimes(24)
})

it('refreshes active API pools at the deadline and accepts their older amounts', async () => {
  const fetch = vi.fn(async () => {
    const result = await Promise.resolve(snapshot())
    return owner.merge('wallet', 'uni', result)
  })
  const observer = new QueryObserver(client, { queryKey: key('uni'), queryFn: fetch, staleTime: Infinity })
  const unsubscribe = observer.subscribe(() => {})
  owner.start(1, 'wallet', 100, [address])
  await flush()
  expect(client.getQueryData<SelectorInventorySnapshot>(key('uni'))?.chains[1][address].rawBalance).toBe(60n)
  await vi.advanceTimersByTimeAsync(120_000)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(client.getQueryData<SelectorInventorySnapshot>(key('uni'))?.chains[1][address].rawBalance).toBe(100n)
  unsubscribe()
})

it('retains successful live data on failures without extending the window', async () => {
  owner.start(1, 'wallet', 100, [address])
  await flush()
  live.mockRejectedValue(new Error('offline'))
  await vi.advanceTimersByTimeAsync(119_999)
  expect(owner.merge('wallet', 'uni', snapshot()).chains[1][address].rawBalance).toBe(60n)
  await vi.advanceTimersByTimeAsync(600_000)
  expect(live).toHaveBeenCalledTimes(24)
  expect(owner.merge('wallet', 'uni', snapshot()).chains[1][address].rawBalance).toBe(100n)
})

it('aborts a stalled request exactly at the deadline and ignores its late result', async () => {
  let finish!: (rows: ReturnType<typeof row>[]) => void
  live.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  owner.start(1, 'wallet', 100, [address])
  await flush()
  const signal = live.mock.calls[0][3] as AbortSignal
  await vi.advanceTimersByTimeAsync(120_000)
  expect(signal.aborted).toBe(true)
  finish([row()])
  await flush()
  expect(client.getQueryData<SelectorInventorySnapshot>(key('uni'))?.chains[1][address].rawBalance).toBe(100n)
  expect(live).toHaveBeenCalledTimes(1)
})

it('restarts on another confirmation, rejects old responses and preserves the highest receipt block', async () => {
  let finish!: (rows: ReturnType<typeof row>[]) => void
  live.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  owner.start(1, 'wallet', 101, [address])
  await flush()
  await vi.advanceTimersByTimeAsync(1_000)
  owner.start(1, 'wallet', 100, [address])
  await flush()
  finish([row(80n)])
  await flush()
  expect(owner.merge('wallet', 'uni', snapshot()).chains[1][address].rawBalance).toBe(100n)
  live.mockResolvedValue([row(40n, 101)])
  await vi.advanceTimersByTimeAsync(5_000)
  expect(owner.merge('wallet', 'uni', snapshot()).chains[1][address].rawBalance).toBe(40n)
  await vi.advanceTimersByTimeAsync(114_000)
  expect(owner.merge('wallet', 'uni', snapshot()).chains[1][address].rawBalance).toBe(40n)
  await vi.advanceTimersByTimeAsync(1_000)
  expect(owner.merge('wallet', 'uni', snapshot()).chains[1][address].rawBalance).toBe(100n)
})

it('keeps newer indexed rows and does not reset query freshness when patching live rows', async () => {
  const updatedAt = client.getQueryState(key(1))?.dataUpdatedAt
  owner.start(1, 'wallet', undefined, [address])
  await vi.advanceTimersByTimeAsync(5_000)
  expect(owner.merge('wallet', 1, snapshot(70n, 101)).chains[1][address].rawBalance).toBe(70n)
  expect(client.getQueryState(key(1))?.dataUpdatedAt).toBe(updatedAt)
})

it('keeps the window across selector close/reopen and cancels it when the updater disposes', async () => {
  owner.start(1, 'wallet', 100, [address])
  await flush()
  client.removeQueries({ queryKey: ['token-selector-inventory'] })
  await vi.advanceTimersByTimeAsync(5_000)
  expect(owner.merge('wallet', 'uni', snapshot()).chains[1][address].rawBalance).toBe(60n)
  owner.dispose()
  const count = live.mock.calls.length
  await vi.advanceTimersByTimeAsync(600_000)
  expect(live).toHaveBeenCalledTimes(count)
  expect(owner.merge('wallet', 'uni', snapshot()).chains[1][address].rawBalance).toBe(100n)
})

it.each(['confirmation', 'deadline'])('retains live patches when %s cancels an indexed fetch', async trigger => {
  owner.start(1, 'wallet', 100, [address])
  await flush()
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('cancelled')))
        }),
    )
    .mockRejectedValue(new Error('offline'))
  const observer = new QueryObserver(client, { queryKey: key('uni'), queryFn: fetch, retry: false })
  const unsubscribe = observer.subscribe(() => {})
  live.mockResolvedValue([row(40n, 101)])
  await vi.advanceTimersByTimeAsync(5_000)
  expect(client.getQueryData<SelectorInventorySnapshot>(key('uni'))?.chains[1][address].rawBalance).toBe(40n)

  live.mockRejectedValue(new Error('offline'))
  if (trigger === 'confirmation') {
    owner.start(1, 'wallet', 102, [address])
    await flush()
  } else {
    await vi.advanceTimersByTimeAsync(115_000)
  }
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(client.getQueryData<SelectorInventorySnapshot>(key('uni'))?.chains[1][address].rawBalance).toBe(40n)
  unsubscribe()
})
