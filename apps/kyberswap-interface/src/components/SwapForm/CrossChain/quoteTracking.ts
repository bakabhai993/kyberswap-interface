import type { ChainId } from '@kyberswap/ks-sdk-core'
import type { Quote } from 'services/crossChain/registry'
import { formatUnits } from 'viem'

import { NativeCurrencies } from 'constants/tokens'

export const getQuoteTracking = ({ quote, adapter }: Quote) => {
  const { fromChain, toChain, fromToken, toToken, amount, gasDrop } = quote.quoteParams
  const native = NativeCurrencies[toChain as ChainId]
  return {
    mode: 'cross-chain',
    from_chain_id: fromChain,
    to_chain_id: toChain,
    from_token: fromToken.symbol,
    to_token: toToken.symbol,
    amount_in: formatUnits(BigInt(amount), fromToken.decimals),
    amount_out: quote.formattedOutputAmount,
    amount_in_usd: quote.inputUsd,
    amount_out_usd: quote.outputUsd,
    provider: adapter.getName(),
    gas_drop_enabled: !!gasDrop && !!quote.gasDrop,
    gas_drop_amount: quote.gasDrop && native ? formatUnits(BigInt(quote.gasDrop.amount), native.decimals) : undefined,
    gas_drop_unit: quote.gasDrop && native ? native.symbol : undefined,
  }
}
