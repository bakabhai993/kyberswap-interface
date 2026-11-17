// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { SelectorInventoryFirstPageError, fetchSelectorInventory } from 'services/selectorInventory'
import { afterEach, expect, it, vi } from 'vitest'

import { getSelectorInventoryCatchup } from 'state/walletInventory/selectorCatchup'

import { useSelectorInventory } from './useSelectorInventory'

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
    balances: [
      {
        chainId: 1,
        tokenAddress: address,
        rawAmount: amount,
        blockNumber: 10,
        valueUsd: 2,
        decimals: 18,
        symbol: 'AAA',
      },
    ],
    nextCursor: null,
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
it('reads tokenAddress in both pools', async () => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => page('0x2a') })
  expect((await fetchSelectorInventory('wallet', 'uni')).chains[1][address].rawBalance).toBe(42n)
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      code: 0,
      data: {
        balances: [{ tokenAddress: address, rawAmount: '7', blockNumber: 10 }],
        nextCursor: null,
      },
    }),
  })
  expect((await fetchSelectorInventory('wallet', 1)).chains[1][address].rawBalance).toBe(7n)
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
  expect(observations[1]).toMatchObject({ active: true, rows: {} })
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
  expect(observations.every(inventory => !inventory.allowRpcFallback)).toBe(true)
  mocks.account = 'no-cache'
  await render()
  expect(observations.every(inventory => !inventory.active && inventory.allowRpcFallback)).toBe(true)
})
it.each(['0x', '0', '0x00'])('preserves explicit zero balances (%s) for partial inventory resolution', async raw => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true, json: async () => page(raw) })
  expect((await fetchSelectorInventory('wallet', 'uni')).chains[1][address].rawBalance).toBe(0n)
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
  await getSelectorInventoryCatchup(client).refresh(1, 'WALLET')
  finishOld('before confirmation')
  await Promise.resolve()
  expect(oldSignal?.aborted).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(client.getQueryData(key)).toBe('after confirmation')
  unsubscribe()
})

it('walks per-chain pages by block/address and keeps the latest balance, including zero', async () => {
  vi.stubGlobal('fetch', fetchMock)
  const row = page('10').data.balances[0]
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ code: 0, data: { balances: Array.from({ length: 1000 }, () => row) } }),
  })
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ code: 0, data: { balances: [{ ...row, rawAmount: '0', blockNumber: 11 }] } }),
  })
  expect((await fetchSelectorInventory('wallet', 1)).chains[1][address].rawBalance).toBe(0n)
  const url = new URL(fetchMock.mock.calls[1][0])
  expect(url.searchParams.get('sinceBlockNumber')).toBe('10')
  expect(url.searchParams.get('lastTokenAddr')).toBe(address)
  expect(url.searchParams.get('limit')).toBe('1000')
})

it('keeps the entire final page and uses $0.1 only to stop fetching more pages', async () => {
  vi.stubGlobal('fetch', fetchMock)
  const row = page('10').data.balances[0]
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      code: 0,
      data: { balances: Array.from({ length: 1000 }, () => ({ ...row, valueUsd: 0.1 })), nextCursor: 'next+=' },
    }),
  })
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      code: 0,
      data: {
        balances: [
          { ...row, chainId: 56, valueUsd: 1 },
          { ...row, chainId: 137, valueUsd: 0.09 },
          { ...row, chainId: 42161, valueUsd: 0 },
        ],
        nextCursor: 'unused',
      },
    }),
  })
  const result = await fetchSelectorInventory('wallet', 'uni')
  expect(Object.keys(result.chains)).toEqual(['1', '56', '137', '42161'])
  expect(result.complete).toBe(false)
  expect(result.chains[137][address].rawBalance).toBe(10n)
  expect(result.chains[42161][address].rawBalance).toBe(10n)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('cursor')).toBe('next+=')
  expect(fetchMock.mock.calls.every(([url]) => new URL(url).searchParams.get('limit') === '1000')).toBe(true)
})

it('rejects a failed later page and repeated all-chain cursors', async () => {
  vi.stubGlobal('fetch', fetchMock)
  const response = { ok: true, json: async () => ({ ...page('10'), data: { ...page('10').data, nextCursor: 'same' } }) }
  fetchMock.mockResolvedValueOnce(response).mockRejectedValueOnce(new Error('second page failed'))
  await expect(fetchSelectorInventory('wallet', 'uni')).rejects.toThrow('second page failed')
  fetchMock.mockResolvedValue(response)
  await expect(fetchSelectorInventory('wallet', 'uni')).rejects.toThrow('cursor did not advance')
})

it('retains partial inventory when the per-chain walk reaches its safety cap', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', fetchMock)
  const row = page('10').data.balances[0]
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ code: 0, data: { balances: Array.from({ length: 1000 }, () => row) } }),
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(document.createElement('div'))
  let observed: ReturnType<typeof useSelectorInventory> | undefined
  const Probe = () => {
    observed = useSelectorInventory(1)
    return null
  }
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
  expect(fetchMock).toHaveBeenCalledTimes(10)
  expect(observed).toMatchObject({ active: true, complete: false, allowRpcFallback: false })
})

it('keeps partial all-chain rows active and treats an exhausted last page as complete', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', fetchMock)
  const data = {
    ...page('10').data,
    balances: [{ ...page('10').data.balances[0], valueUsd: 0.09 }],
    nextCursor: 'more',
  }
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: 0, data }) })
  client = new QueryClient()
  root = createRoot(document.createElement('div'))
  let observed: ReturnType<typeof useSelectorInventory> | undefined
  const Probe = () => {
    observed = useSelectorInventory(1, true, true)
    return null
  }
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
  expect(observed).toMatchObject({ active: true, complete: false, allowRpcFallback: false })
  expect(observed?.rows[address].rawBalance).toBe(10n)
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: 0, data: { ...data, nextCursor: null } }) })
  expect((await fetchSelectorInventory('wallet', 'uni')).complete).toBe(true)
})

it.each([1, 'uni'] as const)('distinguishes first-page failures from later failures in pool %s', async pool => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockRejectedValueOnce(new Error('offline'))
  await expect(fetchSelectorInventory('wallet', pool)).rejects.toBeInstanceOf(SelectorInventoryFirstPageError)
  const firstPage = {
    code: 0,
    data: { balances: Array.from({ length: 1000 }, () => page('10').data.balances[0]), nextCursor: 'next' },
  }
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => firstPage })
    .mockRejectedValueOnce(new Error('later page'))
  const error = await fetchSelectorInventory('wallet', pool).catch(error => error)
  expect(error).toBeInstanceOf(Error)
  expect(error).not.toBeInstanceOf(SelectorInventoryFirstPageError)
})

it.each([false, true])('caps all-chain fetching at ten pages (exhausted: %s)', async exhausted => {
  vi.stubGlobal('fetch', fetchMock)
  for (let index = 0; index < 10; index++) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 0,
        data: { ...page(String(index + 1)).data, nextCursor: exhausted && index === 9 ? null : String(index + 1) },
      }),
    })
  }
  const result = await fetchSelectorInventory('wallet', 'uni')
  expect(fetchMock).toHaveBeenCalledTimes(10)
  expect(result.complete).toBe(exhausted)
  expect(result.chains[1][address].rawBalance).toBe(10n)
})

it.each([undefined, null])(
  'rejects missing per-chain balances (%s) and retains the cached inventory',
  async balances => {
    vi.stubGlobal('fetch', fetchMock)
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const queryKey = ['token-selector-inventory', 'wallet', 1]
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => page('10') })
    const cached = await client.fetchQuery({ queryKey, queryFn: () => fetchSelectorInventory('wallet', 1) })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, data: { balances } }) })
    await expect(
      client.fetchQuery({ queryKey, queryFn: () => fetchSelectorInventory('wallet', 1) }),
    ).rejects.toBeInstanceOf(SelectorInventoryFirstPageError)
    expect(client.getQueryData(queryKey)).toEqual(cached)
  },
)
