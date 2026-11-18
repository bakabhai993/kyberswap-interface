// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import LiquiditySourcesPanel from './LiquiditySourcesPanel'
import CrossChainSwapSources from './SwapSettingsPanel/CrossChainSwapSources'

vi.mock('@lingui/react', () => ({ Trans: () => null }))

const mocks = vi.hoisted(() => ({ track: vi.fn(), save: vi.fn(), excluded: [] as string[] }))
vi.mock('hooks/useTracking', () => ({
  default: () => ({ trackingHandler: mocks.track }),
  TRACKING_EVENT_TYPE: { SWAP_ROUTING_SOURCE_TOGGLED: 'toggled' },
}))
vi.mock('state/customizeDexes/hooks', () => ({
  useAllDexes: () => [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  useExcludeDexes: () => [mocks.excluded, mocks.save],
}))
vi.mock('services/crossChain/factory', () => ({
  CrossChainSwapFactory: { getSelectableSources: () => ['a', 'b'].map(name => ({ getName: () => name })) },
}))
vi.mock('state/crossChainSwap', () => ({ updateExcludedSources: (value: string[]) => value }))
vi.mock('state/hooks', () => ({
  useAppDispatch: () => mocks.save,
  useAppSelector: (select: any) => select({ crossChainSwap: { excludedSources: mocks.excluded } }),
}))
vi.mock('components/SwapForm/Settings/LiquiditySourcesPanel/Group', () => ({ LiquiditySourceGroup: () => null }))
vi.mock('components/SwapForm/Settings/LiquiditySourcesPanel/SearchBar', () => ({ SearchBar: () => null }))
vi.mock('components/SwapForm/Settings/LiquiditySourcesPanel/components', () => ({
  BackIconWrapper: 'button',
  ImageWrapper: 'div',
  LiquiditySourceHeader: 'div',
  Source: 'div',
  SourceList: 'div',
  SourceName: 'span',
}))

let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  mocks.excluded = []
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

it.each(['same-chain', 'cross-chain'])('emits one counted event per bulk source change (%s)', async mode => {
  const render = () =>
    act(async () =>
      root.render(
        mode === 'same-chain' ? (
          <LiquiditySourcesPanel onBack={() => undefined} chainId={1} />
        ) : (
          <CrossChainSwapSources />
        ),
      ),
    )
  await render()
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click())
  expect(mocks.track).toHaveBeenCalledTimes(1)
  expect(mocks.track).toHaveBeenCalledWith('toggled', expect.objectContaining({ mode, count: 2, enabled: false }))
  expect(mocks.save).toHaveBeenCalledWith(['a', 'b'])
  mocks.excluded = ['a', 'b']
  mocks.track.mockClear()
  await render()
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click())
  expect(mocks.track).toHaveBeenCalledTimes(1)
  expect(mocks.track).toHaveBeenCalledWith('toggled', expect.objectContaining({ mode, count: 2, enabled: true }))
})
