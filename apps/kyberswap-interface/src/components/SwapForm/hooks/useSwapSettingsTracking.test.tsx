// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useSwapSettingsTracking } from './useSwapSettingsTracking'

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  state: {
    user: { userSlippageTolerance: 50 },
    customizeDexes: { excludeDexes: {} },
    crossChainSwap: { excludedSources: [] },
  },
}))
vi.mock('components/TradeLayout/Tabs', () => ({
  TAB: { SETTINGS: 'settings', LIQUIDITY_SOURCES: 'sources', CROSS_CHAIN_SOURCES: 'providers' },
}))
vi.mock('hooks/useTracking', () => ({
  default: () => ({ trackingHandler: mocks.track }),
  TRACKING_EVENT_TYPE: { SWAP_SETTINGS_OPENED: 'open', SWAP_SETTINGS_CLOSED: 'close' },
}))
vi.mock('state/hooks', () => ({ useAppSelector: (select: any) => select(mocks.state) }))
vi.mock('state/swap/hooks', () => ({
  useSwapCurrencyResolution: () => ({ fromCurrency: 'ETH', toCurrency: 'USDC', inputChain: 1, outputChain: 8453 }),
}))

let root: ReturnType<typeof createRoot>
const Harness = ({ tab, recipient }: { tab: string; recipient: string }) => {
  useSwapSettingsTracking(tab as any, recipient)
  return null
}
const render = (tab: string, recipient = '') =>
  act(async () => root.render(<Harness tab={tab} recipient={recipient} />))
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.track.mockClear()
  mocks.state.user.userSlippageTolerance = 50
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

it('keeps one settings session through source subpanels and reports an unchanged close', async () => {
  await render('swap')
  await render('settings')
  await render('sources')
  await render('settings')
  await render('swap')
  expect(mocks.track.mock.calls).toEqual([
    ['open', expect.objectContaining({ mode: 'cross-chain', from_chain_id: 1, to_chain_id: 8453 })],
    ['close', expect.objectContaining({ settings_changed: false })],
  ])
})
it('remembers committed edits even when reverted before closing', async () => {
  await render('settings')
  mocks.state.user.userSlippageTolerance = 100
  await render('settings')
  mocks.state.user.userSlippageTolerance = 50
  await render('swap')
  expect(mocks.track).toHaveBeenLastCalledWith('close', expect.objectContaining({ settings_changed: true }))
})
it('includes a recipient applied in the same render that closes settings', async () => {
  await render('settings')
  await render('swap', '0xrecipient')
  expect(mocks.track).toHaveBeenLastCalledWith('close', expect.objectContaining({ settings_changed: true }))
})
