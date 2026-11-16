// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

import { TransactionStatusUpdater, WalletHistorySubscriptions } from './TransactionUpdater'

const mocks = vi.hoisted(() => ({
  transactions: [] as { status: string }[],
  processing: [] as { status: string }[],
  poll: vi.fn(),
  provider: vi.fn(),
  wallets: undefined as undefined | { inputAddress: string; inputConnection?: { family: string } },
  backend: vi.fn(),
}))
vi.mock('components/SwapTransactions/Processing/useProcessingTransactions', () => ({
  useProcessingTransactions: () => mocks.processing,
}))
vi.mock('services/walletTransactionsApi', () => ({ useGetTransactionsInfiniteQuerySubscription: mocks.poll }))
vi.mock('hooks', () => ({ useActiveWeb3React: () => ({ account: '0xAbC' }) }))
vi.mock('components/SwapWallets/SwapWalletContext', () => ({ useSwapWallets: () => mocks.wallets }))
vi.mock('state/crossChainSwap', () => ({ useCrossChainTransactions: () => mocks.transactions }))
vi.mock('state/crossChainSwap/useBackendTransactionUpdater', () => ({ useBackendTransactionUpdater: mocks.backend }))
vi.mock('state/crossChainSwap/useRestoreMyNearWalletTransaction', () => ({
  useRestoreMyNearWalletTransaction: () => {},
}))
vi.mock('./ProviderTransactionUpdater', () => ({
  default: () => {
    mocks.provider()
    return null
  },
}))
let root: ReturnType<typeof createRoot>
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  mocks.processing = []
  mocks.transactions = []
  mocks.wallets = undefined
})
it('tracks local settlement without subscribing to wallet history', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<TransactionStatusUpdater />))
  expect(mocks.poll).not.toHaveBeenCalled()
  expect(mocks.backend).toHaveBeenCalled()
  expect(mocks.provider).not.toHaveBeenCalled()
  mocks.transactions = [{ status: 'Success' }]
  await act(async () => root.render(<TransactionStatusUpdater />))
  expect(mocks.provider).toHaveBeenCalled()
})

it('keeps history polling for processing transactions and stops after settlement when closed', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  root = createRoot(document.createElement('div'))
  const render = async (showHistory: boolean) => {
    mocks.poll.mockClear()
    await act(async () => root.render(<WalletHistorySubscriptions showHistory={showHistory} />))
  }

  await render(false)
  expect(mocks.poll).not.toHaveBeenCalled()
  await render(true)
  expect(mocks.poll).toHaveBeenCalled()

  mocks.processing = [{ status: 'Processing' }]
  await render(false)
  expect(mocks.poll).toHaveBeenCalled()

  mocks.processing = []
  await render(false)
  expect(mocks.poll).not.toHaveBeenCalled()

  await render(true)
  expect(mocks.poll).toHaveBeenCalled()
})

it.each([
  [undefined, '0xabc'],
  [{ inputAddress: '0xDEF', inputConnection: { family: 'evm' } }, '0xdef'],
  [{ inputAddress: 'SoLAddress', inputConnection: { family: 'solana' } }, 'SoLAddress'],
  [{ inputAddress: '' }, ''],
])('subscribes only to the input wallet, falling back to EVM only without context (%j)', async (wallets, sender) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.wallets = wallets
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<WalletHistorySubscriptions showHistory />))
  expect(mocks.poll).toHaveBeenCalledWith(sender, expect.objectContaining({ skip: !sender, pollingInterval: 10_000 }))
})
