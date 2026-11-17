import { Currency, CurrencyAmount } from '@kyberswap/ks-sdk-core'

import SetExitPriceButton from 'components/StopMarket/SetExitPriceButton'
import { useSwapFormContext } from 'components/SwapForm/SwapFormContext'
import SwapReviewContent from 'components/SwapForm/SwapModal/SwapReviewContent'
import { SwapStatusAmount, SwapStatusAmounts } from 'components/SwapForm/SwapModal/SwapStatusAmounts'
import type { SwapReviewState } from 'components/SwapForm/hooks/useSwapReviewSession'
import TransactionConfirmationModal, {
  Mode,
  Phase,
  TransactionErrorContent,
} from 'components/TransactionConfirmationModal'
import { useActiveWeb3React } from 'hooks'
import { getERC8056DisplayAmount } from 'hooks/useERC8056Token'
import { getCurrencyDisplaySymbol } from 'utils/tokenInfo'

type SingleChainSwapModalProps = {
  isOpen: boolean
  tokenToAdd: Currency | undefined
  review: SwapReviewState
  onConfirm?: () => void
  onDismiss?: () => void
  onDismissError?: () => void
}

const SingleChainSwapModal = ({
  isOpen,
  tokenToAdd,
  review,
  onConfirm,
  onDismiss,
  onDismissError,
}: SingleChainSwapModalProps) => {
  const { chainId } = useActiveWeb3React()
  const { routeSummary, displayTypedValue, outputERC8056Info } = useSwapFormContext()

  const { buildResult, error, txHash, phase } = review
  const isSubmitting = phase === Phase.PREPARING || phase === Phase.SIGNING
  const isSubmitted = !!txHash

  const currencyIn = routeSummary?.parsedAmountIn?.currency
  const currencyOut = routeSummary?.parsedAmountOut?.currency

  const amountOut = currencyOut && CurrencyAmount.fromRawAmount(currencyOut, buildResult?.data?.amountOut || '0')
  const input: SwapStatusAmount = {
    currency: currencyIn,
    chainId,
    amount: displayTypedValue || routeSummary?.parsedAmountIn?.toSignificant(6),
    symbol: getCurrencyDisplaySymbol(currencyIn),
  }
  const output: SwapStatusAmount = {
    currency: currencyOut,
    chainId,
    amount: getERC8056DisplayAmount(outputERC8056Info, amountOut)?.toSignificant(6),
    symbol: getCurrencyDisplaySymbol(currencyOut),
  }

  return (
    <TransactionConfirmationModal
      isOpen={isOpen}
      onDismiss={() => onDismiss?.()}
      {...(isSubmitting
        ? { mode: Mode.PENDING, phase }
        : isSubmitted
        ? {
            mode: Mode.SUBMITTED,
            chainId,
            txHash,
            tokenToAdd: tokenToAdd?.isToken ? tokenToAdd : undefined,
            secondaryAction: (
              <SetExitPriceButton
                currency={currencyOut}
                amount={routeSummary?.parsedAmountOut}
                onNavigate={onDismiss}
              />
            ),
          }
        : { mode: Mode.CUSTOM })}
    >
      {isSubmitting || isSubmitted ? (
        <SwapStatusAmounts input={input} output={output} />
      ) : error ? (
        <TransactionErrorContent onDismiss={() => onDismissError?.()} message={error} />
      ) : (
        <SwapReviewContent
          isBuildingRoute={phase === 'building'}
          buildError={buildResult?.error}
          onDismiss={() => onDismissError?.()}
          onConfirm={onConfirm}
          buildResult={buildResult}
        />
      )}
    </TransactionConfirmationModal>
  )
}

export default SingleChainSwapModal
