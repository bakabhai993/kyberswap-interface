import { QuoteParams, QuoteProvider } from 'services/crossChain/adapters/types'
import { streamQuotes } from 'services/crossChain/quote/streamQuotes'
import { PairCategory } from 'services/crossChain/quote/utils'
import { CrossChainSwapAdapterRegistry, Quote } from 'services/crossChain/registry'

import { Currency, NOT_SUPPORTED_CHAINS_PRICE_SERVICE, isEvmChain } from 'types/crossChain'

const DEFAULT_QUOTE_TIMEOUT_MS = 10_000

type QuoteRunnerParams = {
  params: QuoteParams
  category: PairCategory
  currencyIn: Currency
  currencyOut: Currency
  excludedSources: string[]
  registry: CrossChainSwapAdapterRegistry
  signal: AbortSignal
  isReadOnly: boolean
  onQuotes: (quotes: Quote[]) => void
  onQuoteReady: () => void
}

const getAdapterQuote = async (adapter: QuoteProvider, params: QuoteParams, signal: AbortSignal) => {
  if (signal.aborted) throw new Error('Cancelled')

  const requestController = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let handleAbort: (() => void) | undefined

  const cancellationPromise = new Promise<never>((_, reject) => {
    handleAbort = () => {
      reject(new Error('Cancelled'))
      requestController.abort()
    }
    signal.addEventListener('abort', handleAbort, { once: true })

    timeoutId = setTimeout(() => {
      reject(new Error('Timeout'))
      requestController.abort()
    }, DEFAULT_QUOTE_TIMEOUT_MS)
  })

  try {
    return await Promise.race([adapter.getQuote(params, requestController.signal), cancellationPromise])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    if (handleAbort) signal.removeEventListener('abort', handleAbort)
  }
}

export const isSameChainEvmSwap = (params: QuoteParams) =>
  params.fromChain === params.toChain &&
  isEvmChain(params.fromChain) &&
  !NOT_SUPPORTED_CHAINS_PRICE_SERVICE.includes(params.fromChain) &&
  !NOT_SUPPORTED_CHAINS_PRICE_SERVICE.includes(params.toChain)

export const getSameChainQuote = async ({
  params,
  category,
  currencyIn,
  currencyOut,
  registry,
  signal,
  isReadOnly,
  onQuotes,
  onQuoteReady,
}: QuoteRunnerParams) => {
  const kyberswapAdapter = registry.getQuoteAdapter('KyberSwap')
  const isKyberSwapSupported = kyberswapAdapter?.canSupport(category, currencyIn, currencyOut) ?? true

  if (kyberswapAdapter && isKyberSwapSupported) {
    try {
      console.log('Using KyberSwap adapter for same-chain swap')
      if (signal.aborted) throw new Error('Cancelled')

      const quote = await getAdapterQuote(kyberswapAdapter, params, signal)
      if (signal.aborted) throw new Error('Cancelled')

      onQuotes([{ adapter: kyberswapAdapter, quote, isReadOnly }])
      onQuoteReady()
      return
    } catch (error) {
      if ((error as Error).message === 'Cancelled' || signal.aborted) throw new Error('Cancelled')
      console.error('Failed to get quote from KyberSwap:', error)
      throw new Error('No valid quotes found for the requested swap')
    }
  }

  if (!isKyberSwapSupported) throw new Error('KyberSwap does not support this token pair category.')
  throw new Error('KyberSwap adapter not available')
}

export const getQuotes = async (options: QuoteRunnerParams) => {
  if (isSameChainEvmSwap(options.params)) {
    await getSameChainQuote(options)
    return
  }

  try {
    await streamQuotes({ ...options, onSoftTimeout: options.onQuoteReady })
    return
  } catch (error) {
    if ((error as Error).message === 'Cancelled' || options.signal.aborted) throw new Error('Cancelled')
    console.error('Failed to get quotes from streaming API:', error)
    throw error
  }
}
