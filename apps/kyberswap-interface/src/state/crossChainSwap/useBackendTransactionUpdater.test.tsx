// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'

import { useBackendTransactionUpdater } from './useBackendTransactionUpdater'

const mocks = vi.hoisted(() => ({ track: vi.fn(), mixpanel: vi.fn(), entry: undefined as any }))
vi.mock('hooks/useTracking', () => ({
  default: () => ({ trackingHandler: mocks.track }),
  useCrossChainMixpanel: () => ({ crossChainMixpanelHandler: mocks.mixpanel }),
  CROSS_CHAIN_MIXPANEL_TYPE: {},
  TRACKING_EVENT_TYPE: { SWAP_SETTLED: 'settled' },
}))
vi.mock('services/crossChain/tracking', () => ({ getSwapTrackingData: () => ({}) }))
vi.mock('state/crossChainSwap/model', () => ({
  isBackendResolved: () => true,
  mergeOutboxTransaction: () => ({ status: 'Success', amountInUsd: 42 }),
}))
vi.mock('state/crossChainSwap', () => ({
  finishTransactionSync: vi.fn(),
  saveTransactionSync: vi.fn(),
  selectTransactionSync: () => mocks.entry,
  selectTransactionSyncs: () => [mocks.entry],
}))
vi.mock('state/crossChainSwap/reconcile', () => ({ reconcileTransaction: vi.fn() }))
vi.mock('state/hooks', () => ({ useAppDispatch: () => vi.fn(), useAppSelector: () => [] }))
vi.mock('react-redux', () => ({ useStore: () => ({ getState: () => ({}) }) }))

it.each([
  ['quote', 123, 123],
  ['quote', null, 42],
  ['different-quote', 99, 99],
  ['different-quote', null, undefined],
])('keeps canonical input USD for settlement (%s, %s)', async (quoteId, inputUsd, expected) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.track.mockClear()
  mocks.mixpanel.mockClear()
  mocks.entry = { key: 'key', quoteId: 'quote', feStatus: 'Processing', backend: { quoteId, inputUsd } }
  const root = createRoot(document.createElement('div'))
  const Harness = () => {
    useBackendTransactionUpdater()
    return null
  }
  try {
    await act(async () => root.render(<Harness />))
    expect(mocks.track).toHaveBeenCalledWith('settled', expect.objectContaining({ amount_in_usd: expected }))
    expect(mocks.mixpanel).toHaveBeenCalledWith(undefined, expect.objectContaining({ amount_in_usd: undefined }))
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
