// @vitest-environment happy-dom
import { CurrencyAmount, Token } from '@kyberswap/ks-sdk-core'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { SelectProps } from 'components/Select'

import { CrossChainSwapAction } from './CrossChainSwapAction'

const mocks = vi.hoisted(() => ({ provider: 'KyberCross', approve: vi.fn(), approving: false }))
const token = new Token(1, '0x0000000000000000000000000000000000000001', 18, 'TEST')
vi.mock('components/SwapForm/CrossChain/CrossChainSwapProvider', () => ({
  useCrossChainSwap: () => ({
    fromChainId: 1,
    toChainId: 10,
    currencyIn: token,
    currencyOut: token,
    amountInWei: '100',
    selectedQuote: { adapter: { getName: () => mocks.provider }, quote: { contractAddress: '0xspender' } },
  }),
}))
vi.mock('components/SwapForm/CrossChain/Execution/useCrossChainApproval', () => ({
  useCrossChainApproval: () => ({
    approvalState: 'NOT_APPROVED',
    approve: mocks.approve,
    isApproving: mocks.approving,
  }),
}))
vi.mock('hooks/useApproveCallback', () => ({ ApprovalState: { NOT_APPROVED: 'NOT_APPROVED' } }))
vi.mock('components/SwapForm/CrossChain/Execution/CrossChainSwapConfirmation', () => ({
  CrossChainSwapConfirmation: () => null,
}))
vi.mock('components/SwapForm/CrossChain/hooks/useCrossChainBalance', () => ({ useCrossChainBalance: () => undefined }))
vi.mock('components/SwapForm/SwapActionButton/SwapButtonWithPriceImpact', () => ({ default: () => null }))
vi.mock('components/SwapWallets/SwapWalletContext', () => ({ useSwapWallets: () => ({ inputAddress: '0xsender' }) }))
vi.mock('hooks', () => ({ useActiveWeb3React: () => ({ chainId: 1 }) }))
vi.mock('hooks/useRestrictedTokens', () => ({ useIsTokenAddressRestricted: () => () => false }))
vi.mock('hooks/web3/useChangeNetwork', () => ({ useChangeNetwork: () => ({ changeNetwork: vi.fn() }) }))
vi.mock('state/wallet/hooks', () => ({ useCurrencyBalance: () => CurrencyAmount.fromRawAmount(token, '1000') }))
vi.mock('services/crossChain/quote/utils', () => ({ isEvmCurrency: () => true }))
vi.mock('services/crossChain/utils', () => ({ isQuoteExecutable: () => true }))
vi.mock('components/Button', () => ({ ButtonPrimary: (props: any) => <button {...props} /> }))
vi.mock('components/Select', () => ({
  default: ({ options }: SelectProps) => (
    <div role="group">
      {options.map(option => (
        <button key={option.value} disabled={option.disabled} onClick={option.onSelect}>
          {option.label}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('components/InfoHelper', () => ({ default: () => null }))
vi.mock('components/Dots', () => ({ default: ({ children }: any) => <span>{children}</span> }))

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
const render = () =>
  act(async () => {
    root.render(
      <I18nProvider i18n={i18n}>
        <CrossChainSwapAction />
      </I18nProvider>,
    )
  })
const click = (label: string) =>
  act(async () => {
    const button = [...container.querySelectorAll('button')].find(button => button.textContent === label)
    expect(button).toBeDefined()
    if (!button) throw new Error(`Missing button: ${label}`)
    button.click()
  })
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  i18n.load('en', {})
  i18n.activate('en')
  mocks.provider = 'KyberCross'
  mocks.approving = false
  mocks.approve.mockClear()
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(() => act(() => root.unmount()))

it('defaults KyberCross to Exact and allows explicitly choosing Infinite', async () => {
  await render()
  await click('Approve')
  expect(mocks.approve).toHaveBeenLastCalledWith({ infinite: false })
  await click('Infinite Allowance')
  await click('Approve')
  expect(mocks.approve).toHaveBeenLastCalledWith({ infinite: true })
  await click('Exact Allowance')
  await click('Approve')
  expect(mocks.approve).toHaveBeenLastCalledWith({ infinite: false })
})

it('forces Exact when switching from KyberCross to another provider', async () => {
  await render()
  await click('Infinite Allowance')
  mocks.provider = 'Relay'
  await render()
  expect(container.querySelector('[role="group"]')).toBeNull()
  await click('Approve')
  expect(mocks.approve).toHaveBeenLastCalledWith({ infinite: false })
})

it('locks allowance choice while approval is pending', async () => {
  await render()
  mocks.approving = true
  await render()
  expect([...container.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
})
