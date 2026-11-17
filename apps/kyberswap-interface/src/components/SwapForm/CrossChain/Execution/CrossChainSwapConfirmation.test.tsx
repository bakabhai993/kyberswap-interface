// @vitest-environment happy-dom
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ComponentProps, act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { CrossChainSwapConfirmation } from 'components/SwapForm/CrossChain/Execution/CrossChainSwapConfirmation'
import { NonEvmChain } from 'types/crossChain'

vi.mock('components/Modal', () => ({ default: ({ isOpen, children }: any) => (isOpen ? <div>{children}</div> : null) }))
vi.mock('components/Button', () => ({
  ButtonPrimary: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  ButtonLight: () => null,
  ButtonOutlined: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))
vi.mock('components/Web3Provider', () => ({ CONNECTOR_ICON_OVERRIDE_MAP: {} }))
vi.mock('components/YieldPools/ListGridViewGroup', () => ({ default: () => null }))
vi.mock('components/Collapse', () => ({ Collapse: () => null }))
vi.mock('components/TokenLogo/TokenLogoWithChain', () => ({ TokenLogoWithChain: () => null }))
vi.mock('components/CurrencyLogo', () => ({ default: () => null }))
vi.mock('components/Copy', () => ({ default: () => null }))
vi.mock('components/GasDrop/GasDropAmount', () => ({ GasDropAmount: () => null }))
vi.mock('components/SwapForm/CrossChain/Quote/CrossChainQuoteSummary', () => ({
  CrossChainPriceImpactWarning: () => null,
  CrossChainQuoteSummaryRows: () => null,
}))
vi.mock('components/SwapForm/CrossChain/Quote/QuoteProviderName', () => ({ QuoteProviderName: () => null }))
vi.mock('components/SwapForm/CrossChain/Quote/getQuoteWarning', () => ({ getQuoteWarning: () => undefined }))
vi.mock('components/SwapForm/SwapModal/SwapReviewLayout', () => ({
  SwapReviewAmountCard: () => null,
  SwapReviewHeader: () => null,
}))
vi.mock('services/crossChain/quote/utils', () => ({ isEvmCurrency: () => false }))
vi.mock('services/crossChain/utils', () => ({
  getNetworkInfo: (chain: number) => ({ name: chain === 1 ? 'Ethereum' : 'Base' }),
}))
vi.mock('hooks', () => ({ useActiveWeb3React: () => ({ chainId: 1 }), useWeb3React: () => ({}) }))
vi.mock('wagmi', () => ({ useWatchAsset: () => ({}) }))
vi.mock('state/user/reducer', () => ({ VIEW_MODE: {} }))
vi.mock('theme', () => ({
  ExternalLink: ({ href, children }: any) => <a href={href}>{children}</a>,
  ExternalLinkNoLineHeight: ({ href, children }: any) => <a href={href}>{children}</a>,
}))
vi.mock('utils/redirect', () => ({ navigateToUrl: vi.fn(), validateRedirectURL: vi.fn() }))
vi.mock('utils/errorMessage', () => ({ friendlyError: (error: string) => error }))
vi.mock('utils/tokenLogo', () => ({ getTokenLogoURL: () => '' }))
vi.mock('utils/explorer', () => ({
  getEtherscanLink: (_chain: number, hash: string) => `https://etherscan.io/tx/${hash}`,
}))

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
const dismiss = vi.fn()
type Props = ComponentProps<typeof CrossChainSwapConfirmation>
const quote = {
  category: 'all',
  quote: {
    quoteParams: {
      fromChain: 1,
      toChain: 8453,
      fromToken: { symbol: 'ETH', decimals: 18 },
      toToken: { symbol: 'USDC', decimals: 6 },
      amount: '1000000000000000000',
      recipient: 'receiver',
      slippage: 50,
    },
    formattedOutputAmount: '2000',
  },
} as unknown as NonNullable<Props['quote']>
const render = (props: Partial<Props>) =>
  act(async () =>
    root.render(
      <I18nProvider i18n={i18n}>
        <CrossChainSwapConfirmation
          quote={quote}
          isOpen
          hasVeryHighPriceImpact={false}
          submission={{ phase: 'preparing' }}
          onDismiss={dismiss}
          {...props}
        />
      </I18nProvider>,
    ),
  )
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  i18n.loadAndActivate({ locale: 'en', messages: {} })
  dismiss.mockClear()
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

it('only asks for wallet confirmation during signing and allows dismissal', async () => {
  await render({})
  expect(container.textContent).toContain('Preparing your transaction')
  expect(container.textContent).not.toContain('Confirm this transaction in your wallet')
  await render({ submission: { phase: 'signing' } })
  expect(container.textContent).toContain('Confirm this transaction in your wallet')
  const cancel = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Cancel')
  expect(cancel).toBeDefined()
  await act(async () => cancel?.click())
  expect(dismiss).toHaveBeenCalledOnce()
})

it.each([
  [1, 'https://etherscan.io/tx/source-hash'],
  [NonEvmChain.Near, 'https://nearblocks.io/txns/source-hash'],
  [NonEvmChain.Solana, 'https://solscan.io/tx/source-hash'],
  [NonEvmChain.Bitcoin, 'https://mempool.space/tx/source-hash'],
] as const)('shows the source transaction on %s while the provider is still running', async (fromChain, explorer) => {
  await render({
    quote: { ...quote, quote: { ...quote.quote, quoteParams: { ...quote.quote.quoteParams, fromChain } } },
    submission: { phase: 'submitted', txHash: 'source-hash' },
  })
  expect(container.textContent).toContain('Transaction Submitted')
  expect(container.textContent).toContain('1 ETH')
  expect(container.textContent).toContain('2,000 USDC')
  expect(container.textContent).not.toContain('Confirm this transaction in your wallet')
  expect(container.querySelector('a')?.href).toBe(explorer)
  const close = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Close')
  await act(async () => close?.click())
  expect(dismiss).toHaveBeenCalledOnce()
})

it('replaces pending content with the submission error and allows dismissal', async () => {
  await render({ submission: { phase: 'signing' } })
  await render({ submission: { phase: 'error', error: 'Wallet rejected the transaction' } })

  expect(container.textContent).toContain('Wallet rejected the transaction')
  expect(container.textContent).not.toContain('Confirm this transaction in your wallet')
  const dismissButton = Array.from(container.querySelectorAll('button')).find(
    button => button.textContent === 'Dismiss',
  )
  expect(dismissButton).toBeDefined()
  await act(async () => dismissButton?.click())
  expect(dismiss).toHaveBeenCalledOnce()
})
