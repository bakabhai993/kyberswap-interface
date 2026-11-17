import { ChainId } from '@kyberswap/ks-sdk-core'
import { ArrowRight } from 'react-feather'
import { formatUnits } from 'viem'

import GasStation from 'components/Icons/GasStation'
import { TokenLogoWithChain } from 'components/TokenLogo/TokenLogoWithChain'
import { NativeCurrencies } from 'constants/tokens'
import type { Chain, Currency, GasDropQuote } from 'types/crossChain'
import { formatDisplayNumber } from 'utils/numbers'

export type SwapStatusAmount = {
  currency?: Currency
  chainId: Chain
  amount?: string
  symbol?: string
}

const SwapStatusTokenAmount = ({ currency, chainId, amount, symbol = currency?.symbol }: SwapStatusAmount) => (
  <div className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)] items-center gap-1">
    <TokenLogoWithChain currency={currency} chainId={chainId} />
    <span className="break-words" title={amount}>
      {amount ? formatDisplayNumber(amount, { significantDigits: 6 }) : '--'} {symbol}
    </span>
  </div>
)

type SwapStatusAmountsProps = {
  input: SwapStatusAmount
  output: SwapStatusAmount
  gasDrop?: GasDropQuote
}

const SwapStatusGasDrop = ({ gasDrop, chainId }: { gasDrop: GasDropQuote; chainId: Chain }) => {
  const currency = NativeCurrencies[chainId as ChainId]
  if (!currency) return null

  return (
    <div className="flex items-center gap-1 text-sm font-medium text-subText">
      <GasStation size={16} />
      <span>
        +{formatDisplayNumber(formatUnits(BigInt(gasDrop.amount), currency.decimals), { significantDigits: 6 })}{' '}
        {currency.symbol}
      </span>
    </div>
  )
}

export const SwapStatusAmounts = ({ input, output, gasDrop }: SwapStatusAmountsProps) => (
  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-base font-medium">
    <div className="min-w-0 justify-self-end">
      <SwapStatusTokenAmount {...input} />
    </div>
    <ArrowRight size={16} className="shrink-0" aria-hidden />
    <div className="min-w-0 justify-self-start">
      <SwapStatusTokenAmount {...output} />
    </div>
    {gasDrop && (
      <div className="col-start-3 min-w-0 justify-self-start">
        <SwapStatusGasDrop gasDrop={gasDrop} chainId={output.chainId} />
      </div>
    )}
  </div>
)
