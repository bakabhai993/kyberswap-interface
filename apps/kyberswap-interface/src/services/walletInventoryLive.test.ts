import { afterEach, expect, it, vi } from 'vitest'

import { fetchWalletLiveBalances } from './walletInventory'

vi.mock('constants/env', async importOriginal => ({
  ...(await importOriginal<typeof import('constants/env')>()),
  KD_API_URL: 'https://inventory.test/api',
}))
afterEach(() => {
  vi.unstubAllGlobals()
})
it('requests live addresses once and retains zero rows without mixing indexed balances', async () => {
  const address = '0x0000000000000000000000000000000000000001'
  const second = '0x0000000000000000000000000000000000000002'
  const raw = { tokenAddress: address, rawAmount: '0x', blockNumber: 100 }
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      code: 0,
      data: {
        balances: [{ ...raw, rawAmount: '100' }],
        liveBalances: [raw],
      },
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const rows = await fetchWalletLiveBalances(1, 'wallet', [address, second, address])
  expect(rows).toEqual([{ address, rawBalance: 0n, blockNumber: 100, decimals: undefined, symbol: undefined }])
  const params = new URL(fetchMock.mock.calls[0][0]).searchParams
  expect(params.getAll('liveAddrs')).toEqual([address, second])
  expect(params.get('limit')).toBe('1')
})
it('rejects missing live balances instead of treating missing tokens as zero', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0, data: { balances: [] } }) }),
  )
  await expect(fetchWalletLiveBalances(1, 'wallet', ['token'])).rejects.toThrow('Invalid wallet live balances response')
})
