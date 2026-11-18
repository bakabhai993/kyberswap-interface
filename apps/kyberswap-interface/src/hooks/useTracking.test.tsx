// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import useTracking, { TRACKING_EVENT_TYPE } from 'hooks/useTracking'

const mocks = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('libs/mixpanel', () => ({ default: {}, crossChainMixpanel: {} }))
vi.mock('components/Analytics/formoContext', () => ({ useFormo: () => ({ track: mocks.track }) }))
vi.mock('constants/networks', () => ({
  NETWORKS_INFO: { 1: { route: 'ethereum' }, 8453: { route: 'base' } },
  SUPPORTED_NETWORKS: [1, 8453],
}))
vi.mock('hooks', () => ({ useActiveWeb3React: () => ({ account: 'wallet', networkInfo: {} }) }))
vi.mock('state/swap/hooks', () => ({ useInputCurrency: () => undefined, useOutputCurrency: () => undefined }))

let root: ReturnType<typeof createRoot>
let tracking: ReturnType<typeof useTracking>
beforeEach(async () => {
  mocks.track.mockClear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  root = createRoot(document.createElement('div'))
  const Harness = () => {
    tracking = useTracking()
    return null
  }
  await act(async () => root.render(<Harness />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

it.each([
  [1, 8453, 1, 8453],
  ['ethereum', 'base', 1, 8453],
  ['1', '8453', 1, 8453],
  ['solana', 'near', 'solana', 'near'],
])('normalizes settlement chains %s → %s for Formo', async (fromChain, toChain, fromId, toId) => {
  tracking.trackingHandler(TRACKING_EVENT_TYPE.SWAP_SETTLED, {
    mode: 'cross-chain',
    outcome: 'SUCCESS',
    from_chain: fromChain,
    to_chain: toChain,
    partner: 'KyberCross',
    amount_in_usd: 123,
  })
  expect(mocks.track).toHaveBeenCalledWith('Swap Settled', {
    mode: 'cross-chain',
    outcome: 'SUCCESS',
    from_chain_id: fromId,
    to_chain_id: toId,
    provider: 'KyberCross',
    amount_in_usd: 123,
    volume: 123,
  })
})

it.each([
  [123, 120, 123],
  [200000, 0, 0],
  [200000, 100, 100],
  [Infinity, undefined, 0],
  [undefined, undefined, undefined],
])('uses sanitized input USD as cross-chain settlement volume (%s, %s)', (input, output, expected) => {
  tracking.trackingHandler(TRACKING_EVENT_TYPE.SWAP_SETTLED, {
    mode: 'cross-chain',
    amount_in_usd: input,
    amount_out_usd: output,
  })
  expect(mocks.track).toHaveBeenCalledWith(
    'Swap Settled',
    expect.objectContaining({
      amount_in_usd: expected,
      volume: expected,
    }),
  )
})

it('preserves independent same-chain settlement volume', () => {
  tracking.trackingHandler(TRACKING_EVENT_TYPE.SWAP_SETTLED, {
    mode: 'same-chain',
    amount_in_usd: 123,
    volume: 120,
  })
  expect(mocks.track).toHaveBeenCalledWith(
    'Swap Settled',
    expect.objectContaining({
      amount_in_usd: 123,
      volume: 120,
    }),
  )
})
