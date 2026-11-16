import { ChainId, Currency as EvmCurrency } from '@kyberswap/ks-sdk-core'
import { NormalizedQuote } from 'services/crossChain/adapters/types'
import { getGasDropUsd } from 'services/crossChain/quote/normalizeQuote'
import { Quote } from 'services/crossChain/registry'
import { NEAR_STABLE_COINS, SOLANA_STABLE_COINS } from 'services/crossChain/utils'
import { isAbstractStableToken } from 'services/crossChainTokens'
import { TokenPriceEntry, isPriceStale } from 'services/tokenCatalog'
import { parseUnits } from 'viem'

import { ZERO_ADDRESS } from 'constants/index'
import { Chain, Currency, type NearToken, NonEvmChain, type SolanaToken } from 'types/crossChain'

export type PairCategory = 'stablePair' | 'commonPair' | 'highVolatilityPair' | 'exoticPair'

export type EvmCrossChainCurrency = EvmCurrency & {
  chainId: ChainId
  isNative?: boolean
  wrapped: {
    address: string
    decimals: number
    isStable?: boolean
  }
}

export type TokenPricesResponse = {
  data?: Record<string, Record<string, TokenPriceEntry | undefined> | undefined>
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const isEvmCurrency = (currency: Currency | undefined): currency is EvmCrossChainCurrency => {
  const value: unknown = currency
  if (!isObject(value)) return false

  const wrapped = value.wrapped
  if (!isObject(wrapped)) return false

  return typeof wrapped.address === 'string' && typeof wrapped.decimals === 'number'
}

export const isSolanaToken = (currency: Currency | undefined): currency is SolanaToken => {
  const value: unknown = currency
  return isObject(value) && typeof value.id === 'string'
}

export const isNearToken = (currency: Currency | undefined): currency is NearToken => {
  const value: unknown = currency
  return isObject(value) && typeof value.assetId === 'string'
}

export const getTokenMidPriceUsd = (price: TokenPriceEntry | undefined) => {
  if (!price || isPriceStale(price)) return 0
  const buy = price.PriceBuy
  const sell = price.PriceSell

  if (typeof buy === 'number' && typeof sell === 'number') return (buy + sell) / 2
  return buy || sell || 0
}

export const getCurrencyAddress = (currency: Currency) => {
  if (isEvmCurrency(currency)) return currency.isNative ? ZERO_ADDRESS : currency.wrapped.address
  if (isSolanaToken(currency)) return currency.id
  if (isNearToken(currency)) return currency.assetId
  return currency.symbol || ''
}

export const isStableCurrency = (currency: Currency | undefined, chain: Chain | undefined) => {
  if (isEvmCurrency(currency))
    return chain === ChainId.ABSTRACT ? isAbstractStableToken(currency.wrapped.address) : !!currency.wrapped.isStable
  if (chain === NonEvmChain.Solana && isSolanaToken(currency)) return SOLANA_STABLE_COINS.includes(currency.id)
  if (chain === NonEvmChain.Near && isNearToken(currency)) return NEAR_STABLE_COINS.includes(currency.assetId)
  return false
}

const getNetOutputAmount = (quote: NormalizedQuote): bigint => {
  const { outputAmount, additionalFeeUsd, quoteParams } = quote
  const { tokenOutUsd, toToken } = quoteParams

  const gasDropUsd = getGasDropUsd(quote)
  const adjustmentUsd =
    (Number.isFinite(gasDropUsd) && gasDropUsd > 0 ? gasDropUsd : 0) -
    (Number.isFinite(additionalFeeUsd) ? additionalFeeUsd ?? 0 : 0)

  if (adjustmentUsd && tokenOutUsd && Number.isFinite(tokenOutUsd) && tokenOutUsd > 0) {
    const decimals = toToken?.decimals ?? 18
    const adjustmentInTokens = adjustmentUsd / tokenOutUsd

    try {
      return outputAmount + parseUnits(adjustmentInTokens.toFixed(decimals), decimals)
    } catch (error) {
      console.error('Error converting net output adjustment:', error)
    }
  }
  return outputAmount
}

export const sortQuotesByNetOutput = (quotes: Quote[]) =>
  [...quotes].sort((a, b) => {
    const aNetOutput = getNetOutputAmount(a.quote)
    const bNetOutput = getNetOutputAmount(b.quote)
    return aNetOutput === bNetOutput ? 0 : aNetOutput < bNetOutput ? 1 : -1
  })

export const sortQuotesByOutput = (quotes: Quote[]) =>
  [...quotes].sort((a, b) =>
    a.quote.outputAmount === b.quote.outputAmount ? 0 : a.quote.outputAmount < b.quote.outputAmount ? 1 : -1,
  )

/** Global badge winners, with Gas Drop grouping taking precedence over badge priority. */
export const rankRouteOptions = (quotes: Quote[]) => {
  const byNetOutput = sortQuotesByNetOutput(quotes)
  const bestReturnQuote = byNetOutput[0]
  const fastestQuote = quotes.reduce<Quote | undefined>((fastest, candidate) => {
    const { timeEstimate, outputAmount } = candidate.quote
    if (!Number.isFinite(timeEstimate) || timeEstimate < 0) return fastest
    if (
      !fastest ||
      timeEstimate < fastest.quote.timeEstimate ||
      (timeEstimate === fastest.quote.timeEstimate && outputAmount > fastest.quote.outputAmount)
    )
      return candidate
    return fastest
  }, undefined)
  const badgePriority = (quote: Quote) => (quote === bestReturnQuote ? 0 : quote === fastestQuote ? 1 : 2)
  const rankedQuotes = byNetOutput.sort(
    (a, b) =>
      Number(!!b.quote.quoteParams.gasDrop) - Number(!!a.quote.quoteParams.gasDrop) ||
      badgePriority(a) - badgePriority(b),
  )
  return { rankedQuotes, bestReturnQuote, fastestQuote }
}

export const getMinimumOutputAmount = (quote: NormalizedQuote) =>
  quote.minimumOutputAmount !== undefined
    ? quote.minimumOutputAmount
    : (quote.outputAmount * (10000n - BigInt(quote.quoteParams.slippage))) / 10000n
