// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

import { refreshSelectorInventory } from 'state/walletInventory/updater'

import { fetchSelectorInventory, useSelectorInventory } from './useSelectorInventory'

const mocks = vi.hoisted(() => ({ account: 'wallet' }))
vi.mock('constants/env', async importOriginal => ({
  ...(await importOriginal<typeof import('constants/env')>()),
  KD_API_URL: 'https://inventory.test/api',
}))
vi.mock('state/wallet/WalletBalanceContext', () => ({ useEvmBalanceAccount: () => mocks.account }))
vi.mock('state/walletInventory/store', () => ({ isInventoryChain: () => true }))
const address = '0x0000000000000000000000000000000000000001'
const fetchMock = vi.fn()
let root: ReturnType<typeof createRoot>
let client: QueryClient
const page = (amount: string) => ({
  code: 0,
  data: {
    balances: [{ chainId: 1, tokenAddress: address, rawAmount: amount, decimals: 18, symbol: 'AAA' }],
    nextCursor: 'ignored',
  },
})
afterEach(async () => {
  await act(async () => root?.unmount())
  client?.clear()
  mocks.account = 'wallet'
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})
it('reads tokenAddress in both pools without following nextCursor', async () => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => page('0x2a') })
  expect((await fetchSelectorInventory('wallet', 'uni'))[1][address].rawBalance).toBe(42n)
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      code: 0,
      data: {
        balances: [{ tokenAddress: address, rawAmount: '7', blockNumber: 10 }],
        nextCursor: 'ignored',
      },
    }),
  })
  expect((await fetchSelectorInventory('wallet', 1))[1][address].rawBalance).toBe(7n)
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'https://inventory.test/api/v1/wallets/uni/wallet/balances?limit=1000',
    'https://inventory.test/api/v1/wallets/1/wallet/balances?limit=1000',
  ])
})
it('shares all-chain requests and isolates pools and wallets', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => page(url.includes('/uni/') ? '10' : '20'),
  }))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(document.createElement('div'))
  let observations: ReturnType<typeof useSelectorInventory>[] = []
  const Probe = () => {
    observations = [useSelectorInventory(1, true, true), useSelectorInventory(56, true, true), useSelectorInventory(1)]
    return null
  }
  const render = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      )
    })
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
    })
  }
  await render()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(observations[0].rows[address].rawBalance).toBe(10n)
  expect(observations[1]).toMatchObject({ active: true, rows: {}, allowRpcFallback: false })
  expect(observations[2].rows[address].rawBalance).toBe(20n)
  mocks.account = 'other'
  await render()
  expect(fetchMock).toHaveBeenCalledTimes(4)
  expect(client.getQueryCache().getAll()).toHaveLength(4)

  fetchMock.mockRejectedValue(new Error('network unavailable'))
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['token-selector-inventory', 'other'] })
    await new Promise(resolve => setTimeout(resolve, 30))
  })
  expect(observations[0].rows[address].rawBalance).toBe(10n)
  expect(observations[2].rows[address].rawBalance).toBe(20n)
  mocks.account = 'no-cache'
  await render()
  expect(observations.every(inventory => inventory.active && !Object.keys(inventory.rows).length)).toBe(true)
})
it.each(['0x', '0', '0x00'])('excludes zero holdings (%s) from discovery and held-address maps', async raw => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true, json: async () => page(raw) })
  expect(await fetchSelectorInventory('wallet', 'uni')).toEqual({})
})

it.each([
  { ok: false, status: 503 },
  { ok: true, json: async () => ({ code: 1, message: 'unavailable' }) },
  { ok: true, json: async () => ({ code: 0, data: {} }) },
])('rejects unsuccessful responses so React Query retains cached data', async response => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(response)
  await expect(fetchSelectorInventory('wallet', 'uni')).rejects.toThrow()
})

it('aborts a timed-out request without replacing cached data', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', fetchMock)
  let requestSignal: AbortSignal | undefined
  fetchMock.mockImplementation((_url, { signal }) => {
    requestSignal = signal
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  })
  const request = expect(fetchSelectorInventory('wallet', 'uni')).rejects.toThrow('aborted')
  await vi.advanceTimersByTimeAsync(8_000)
  await request
  expect(requestSignal?.aborted).toBe(true)
})

it('preserves query cancellation instead of publishing an empty wallet', async () => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')))
      }),
  )
  const controller = new AbortController()
  const request = fetchSelectorInventory('wallet', 'uni', controller.signal)
  controller.abort()
  await expect(request).rejects.toThrow('cancelled')
})

it.each([false, true])('restarts an in-flight snapshot after confirmation (cached: %s)', async cached => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = ['token-selector-inventory', 'wallet', 'uni']
  if (cached) client.setQueryData(key, 'cached')
  let finishOld!: (value: string) => void
  let oldSignal: AbortSignal | undefined
  const fetch = vi
    .fn()
    .mockImplementationOnce(({ signal }) => {
      oldSignal = signal
      return new Promise<string>(resolve => {
        finishOld = resolve
      })
    })
    .mockResolvedValue('after confirmation')
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fetch })
  const unsubscribe = observer.subscribe(() => {})
  await refreshSelectorInventory(client, 1, 'WALLET')
  finishOld('before confirmation')
  await Promise.resolve()
  expect(oldSignal?.aborted).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(client.getQueryData(key)).toBe('after confirmation')
  unsubscribe()
})
