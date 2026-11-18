// @vitest-environment happy-dom
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, createContext, useContext } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import CrossChainSwapProvider, {
  useOptionalCrossChainSwap,
} from 'components/SwapForm/CrossChain/CrossChainSwapProvider'
import { CrossChainSwapAction } from 'components/SwapForm/CrossChain/Execution/CrossChainSwapAction'
import { NonEvmChain } from 'types/crossChain'

const mocks = vi.hoisted(() => ({
  degen: false,
  inputAddress: 'sender',
  connect: vi.fn(),
  chainId: 1,
  fromChainId: 'bitcoin' as string | number,
  switchNetwork: vi.fn(),
  loading: false,
  setParams: vi.fn(),
  openReview: vi.fn(),
  closeReview: vi.fn(),
  confirmSwap: vi.fn(),
  invalidateQuotes: vi.fn(),
  allowance: vi.fn(async () => true),
  selectedQuote: { adapter: { getName: () => 'KyberCross' }, quote: { priceImpact: 11 as number | null } },
  reviewQuote: null as unknown,
}))
// Model store notifications even when the engine's input props are unchanged.
const StoreRevision = createContext(0)
let storeRevision = 0
vi.mock('state/user/hooks', () => ({
  useDegenModeManager: () => {
    useContext(StoreRevision)
    return [mocks.degen]
  },
}))
vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams(), mocks.setParams] }))
vi.mock('components/Button', () => ({ ButtonPrimary: (props: any) => <button {...props} /> }))
vi.mock('components/Dots', () => ({ default: ({ children }: any) => <span>{children}</span> }))
vi.mock('components/Tooltip', () => ({ MouseoverTooltip: ({ children }: any) => <span>{children}</span> }))
vi.mock('components/SwapForm/CrossChain/Execution/CrossChainSwapConfirmation', () => ({
  CrossChainSwapConfirmation: ({ isOpen, onConfirm, onDismiss }: any) =>
    isOpen ? (
      <>
        <button data-confirm onClick={onConfirm}>
          Confirm
        </button>
        <button data-dismiss onClick={onDismiss}>
          Close
        </button>
      </>
    ) : null,
}))
vi.mock('components/SwapForm/CrossChain/hooks/useCrossChainPair', () => ({
  useCrossChainPair: () => ({
    fromChainId: mocks.fromChainId,
    toChainId: 1,
    currencyIn: { symbol: 'BTC' },
    currencyOut: { symbol: 'ETH' },
  }),
}))
vi.mock('components/SwapForm/CrossChain/hooks/useCrossChainRecipient', () => ({
  useCrossChainRecipient: () => ({ sender: 'sender', receiver: 'receiver' }),
}))
vi.mock('components/SwapForm/CrossChain/Quote/useCrossChainQuote', () => ({
  useCrossChainQuote: () => ({
    amountInWei: '1',
    selectedQuote: mocks.selectedQuote,
    reviewQuote: mocks.reviewQuote,
    showPreview: !!mocks.reviewQuote,
    loading: mocks.loading,
    openReview: mocks.openReview,
    closeReview: mocks.closeReview,
    invalidateQuotes: mocks.invalidateQuotes,
  }),
}))
vi.mock('components/SwapForm/CrossChain/Execution/useCrossChainExecution', () => ({
  useCrossChainExecution: (_quote: unknown, { onSubmit }: { onSubmit: () => void }) => ({
    submitSwap: () => {
      mocks.confirmSwap()
      onSubmit()
    },
    resetSubmission: vi.fn(),
  }),
}))
vi.mock('components/SwapForm/CrossChain/Execution/useCrossChainApproval', () => ({
  useCrossChainApproval: () => ({ approvalState: 3, revalidateAllowance: mocks.allowance }),
}))
vi.mock('components/SwapForm/CrossChain/hooks/useCrossChainBalance', () => ({
  useCrossChainBalance: () => '100',
}))
vi.mock('components/SwapWallets/SwapWalletContext', () => ({
  useSwapWallets: () => ({ inputAddress: mocks.inputAddress, connectInput: mocks.connect }),
}))
vi.mock('hooks', () => ({ useActiveWeb3React: () => ({ chainId: mocks.chainId }) }))
vi.mock('hooks/useApproveCallback', () => ({ ApprovalState: { NOT_APPROVED: 1 } }))
vi.mock('hooks/useRestrictedTokens', () => ({
  useIsTokenAddressRestricted: () => () => false,
  restrictedTokenMessage: vi.fn(),
}))
vi.mock('hooks/web3/useChangeNetwork', () => ({ useChangeNetwork: () => ({ changeNetwork: mocks.switchNetwork }) }))
vi.mock('state/wallet/hooks', () => ({ useCurrencyBalance: vi.fn() }))
vi.mock('services/crossChain/quote/utils', () => ({ isEvmCurrency: () => false }))
vi.mock('services/crossChain/utils', () => ({ isQuoteExecutable: () => true }))

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
const ReadyAction = () => (useOptionalCrossChainSwap() ? <CrossChainSwapAction /> : null)
const render = async () => {
  await act(async () => {
    await import('components/SwapForm/CrossChain/CrossChainSwapEngine')
    root.render(
      <StoreRevision.Provider value={++storeRevision}>
        <I18nProvider i18n={i18n}>
          <CrossChainSwapProvider fromChain={NonEvmChain.Bitcoin} toChain={1} tokenIn="BTC" tokenOut="ETH" amount="1">
            <ReadyAction />
          </CrossChainSwapProvider>
        </I18nProvider>
      </StoreRevision.Provider>,
    )
  })
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    expect(container.querySelector('button')).not.toBeNull()
  })
}
const click = (selector = 'button') =>
  act(async () => {
    const button = container.querySelector<HTMLButtonElement>(selector)
    if (!button) throw new Error('Missing action button')
    button.click()
  })
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.degen = false
  mocks.inputAddress = 'sender'
  mocks.chainId = 1
  mocks.fromChainId = 'bitcoin'
  mocks.loading = false
  mocks.selectedQuote = { adapter: { getName: () => 'KyberCross' }, quote: { priceImpact: 11 } }
  mocks.allowance.mockResolvedValue(true)
  mocks.reviewQuote = null
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})
it('keeps wallet connection actionable while routes are loading', async () => {
  mocks.inputAddress = ''
  mocks.loading = true
  await render()
  expect(container.querySelector('button')?.disabled).toBe(false)
  await click()
  expect(mocks.connect).toHaveBeenCalledOnce()
})

it('prioritizes network switching over route and balance loading', async () => {
  mocks.fromChainId = 8453
  mocks.loading = true
  await render()
  expect(container.querySelector('button')?.textContent).toBe('Switch Network')
  await click()
  expect(mocks.switchNetwork).toHaveBeenCalledWith(8453)
})

it.each([11, NaN])('gates PI %s before review, then reviews after enabling Degen Mode', async priceImpact => {
  mocks.selectedQuote.quote.priceImpact = priceImpact
  await render()
  await click()
  expect(mocks.setParams.mock.calls[0][0](new URLSearchParams()).get('enableDegenMode')).toBe('true')
  expect(mocks.openReview).not.toHaveBeenCalled()
  expect(mocks.allowance).not.toHaveBeenCalled()
  mocks.degen = true
  await render()
  await click()
  expect(mocks.allowance).toHaveBeenCalledOnce()
  expect(mocks.openReview).toHaveBeenCalledOnce()
})
it('allows PI exactly 10 without Degen Mode', async () => {
  mocks.selectedQuote.quote.priceImpact = 10
  await render()
  await click()
  expect(mocks.setParams).not.toHaveBeenCalled()
  expect(mocks.openReview).toHaveBeenCalledOnce()
})
it('closes review before requesting Settings if Degen Mode is disabled at confirmation', async () => {
  mocks.reviewQuote = { quote: { priceImpact: 11 } }
  await render()
  await click('[data-confirm]')
  expect(mocks.confirmSwap).not.toHaveBeenCalled()
  expect(mocks.closeReview).toHaveBeenCalledOnce()
  expect(mocks.setParams).toHaveBeenCalledOnce()
  expect(mocks.closeReview.mock.invocationCallOrder[0]).toBeLessThan(mocks.setParams.mock.invocationCallOrder[0])
})

it('confirms the reviewed quote once when Degen Mode remains enabled', async () => {
  mocks.degen = true
  mocks.reviewQuote = { quote: { priceImpact: 11 } }
  await render()
  await click('[data-confirm]')
  expect(mocks.confirmSwap).toHaveBeenCalledOnce()
  expect(mocks.closeReview).not.toHaveBeenCalled()
  expect(mocks.setParams).not.toHaveBeenCalled()
})

it('checks current Degen Mode after allowance resolves and ignores repeated clicks', async () => {
  let resolveAllowance = (_approved: boolean) => {}
  mocks.allowance.mockImplementation(
    () =>
      new Promise(resolve => {
        resolveAllowance = resolve
      }),
  )
  mocks.degen = true
  await render()
  await click()
  await click()
  expect(mocks.allowance).toHaveBeenCalledOnce()
  mocks.degen = false
  mocks.inputAddress = 'sender'
  mocks.chainId = 1
  mocks.fromChainId = 'bitcoin'
  await render()
  await act(async () => resolveAllowance(true))
  expect(mocks.openReview).not.toHaveBeenCalled()
  expect(mocks.setParams).toHaveBeenCalledOnce()
})

it('ignores allowance completion for a replaced quote', async () => {
  let resolveAllowance = (_approved: boolean) => {}
  mocks.allowance.mockImplementation(
    () =>
      new Promise(resolve => {
        resolveAllowance = resolve
      }),
  )
  mocks.degen = true
  await render()
  await click()
  mocks.selectedQuote = { adapter: { getName: () => 'KyberCross' }, quote: { priceImpact: 12 } }
  mocks.degen = false
  mocks.inputAddress = 'sender'
  mocks.chainId = 1
  mocks.fromChainId = 'bitcoin'
  await render()
  await act(async () => resolveAllowance(true))
  expect(mocks.openReview).not.toHaveBeenCalled()
  expect(mocks.setParams).not.toHaveBeenCalled()
})

it('disables the CTA while replacement quotes are loading', async () => {
  mocks.loading = true
  await render()
  expect(container.querySelector('button')?.disabled).toBe(true)
  await click()
  expect(mocks.allowance).not.toHaveBeenCalled()
  expect(mocks.openReview).not.toHaveBeenCalled()
})

it('invalidates at submit and dismissal only resumes the quote session', async () => {
  mocks.degen = true
  mocks.reviewQuote = mocks.selectedQuote
  await render()
  await click('[data-confirm]')
  expect(mocks.invalidateQuotes).toHaveBeenCalledOnce()
  expect(mocks.closeReview).not.toHaveBeenCalled()
  await click('[data-dismiss]')
  expect(mocks.invalidateQuotes).toHaveBeenCalledOnce()
  expect(mocks.closeReview).toHaveBeenCalledWith()
})

it('does not invalidate when closing an unsubmitted review', async () => {
  mocks.reviewQuote = mocks.selectedQuote
  await render()
  await click('[data-dismiss]')
  expect(mocks.invalidateQuotes).not.toHaveBeenCalled()
  expect(mocks.closeReview).toHaveBeenCalledWith()
})
