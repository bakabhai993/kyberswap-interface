import { Trans, t } from '@lingui/macro'
import { useState } from 'react'
import { Repeat } from 'react-feather'
import { isEvmCurrency, isStableCurrency } from 'services/crossChain/quote/utils'
import { getChainName } from 'services/crossChain/utils'
import { formatUnits } from 'viem'

import { ButtonPrimary } from 'components/Button'
import IconButton from 'components/Button/IconButton'
import CopyHelper from 'components/Copy'
import CurrencyLogo from 'components/CurrencyLogo'
import Divider from 'components/Divider'
import { GasDropAmount } from 'components/GasDrop/GasDropAmount'
import { NetworkLogo } from 'components/Logo'
import { HStack, Stack } from 'components/Stack'
import {
  CrossChainPriceImpactWarning,
  CrossChainQuoteSummaryRows,
} from 'components/SwapForm/CrossChain/Quote/CrossChainQuoteSummary'
import { QuoteProviderName } from 'components/SwapForm/CrossChain/Quote/QuoteProviderName'
import { getQuoteWarning } from 'components/SwapForm/CrossChain/hooks/getQuoteWarning'
import type { CrossChainSubmission } from 'components/SwapForm/CrossChain/hooks/useCrossChainExecution'
import type { ReviewedQuote } from 'components/SwapForm/CrossChain/hooks/useQuoteSession'
import { SwapReviewAmountCard, SwapReviewHeader } from 'components/SwapForm/SwapModal/SwapReviewLayout'
import { SwapStatusAmount, SwapStatusAmounts } from 'components/SwapForm/SwapModal/SwapStatusAmounts'
import TransactionConfirmationModal, {
  Mode,
  Phase,
  TransactionErrorContent,
} from 'components/TransactionConfirmationModal'
import { ExternalLinkNoLineHeight } from 'theme'
import { Chain, Currency, GasDropQuote, NonEvmChain, isEvmChain } from 'types/crossChain'
import { shortenHash } from 'utils/address'
import { cn } from 'utils/cn'
import { getEtherscanLink } from 'utils/explorer'
import { formatDisplayNumber } from 'utils/numbers'

const CrossChainReviewRate = ({ quote }: { quote: ReviewedQuote }) => {
  const [inverted, setInverted] = useState(false)
  const { fromToken, toToken, fromChain, toChain } = quote.quote.quoteParams
  const defaultInverted = isStableCurrency(fromToken, fromChain) && !isStableCurrency(toToken, toChain)
  const showInverted = defaultInverted !== inverted
  const baseCurrency = showInverted ? toToken : fromToken
  const quoteCurrency = showInverted ? fromToken : toToken
  const rate = showInverted ? 1 / quote.quote.rate : quote.quote.rate

  return (
    <HStack className="min-h-6 items-center gap-1 text-xs">
      <span className="min-w-max font-normal text-subText">
        <Trans>Rate:</Trans>
      </span>
      <span className="whitespace-nowrap font-medium text-text">
        1 {baseCurrency.symbol} = {formatDisplayNumber(rate, { significantDigits: 8 })} {quoteCurrency.symbol}
      </span>
      <IconButton variant="compact" aria-label="Invert exchange rate" onClick={() => setInverted(value => !value)}>
        <Repeat size={12} className="text-text" />
      </IconButton>
    </HStack>
  )
}

type CrossChainReviewAmountProps = {
  chainId: Chain
  currency: Currency
  amount: string
  amountUsd: number
  gasDrop?: GasDropQuote
  label: string
  isOutput?: boolean
}

const CrossChainReviewAmount = ({
  chainId,
  currency,
  amountUsd,
  amount,
  gasDrop,
  label,
  isOutput,
}: CrossChainReviewAmountProps) => {
  const name = getChainName(chainId)

  return (
    <SwapReviewAmountCard
      label={label}
      isOutput={isOutput}
      footer={gasDrop && <GasDropAmount gasDrop={gasDrop} chain={chainId} />}
      headerAside={
        <HStack className="items-center gap-1">
          <NetworkLogo
            chainId={chainId}
            alt={chainId.toString()}
            width={16}
            height={16}
            className="shrink-0 rounded-full"
          />
          <span>{name}</span>
        </HStack>
      }
    >
      <span className="min-w-0 flex-1 truncate text-2xl font-medium">
        {formatDisplayNumber(amount, { significantDigits: 8 })}
      </span>
      <HStack className="shrink-0 items-center gap-2 text-subText">
        <span className="text-sm font-medium">
          ~{formatDisplayNumber(amountUsd, { style: 'currency', significantDigits: 4 })}
        </span>
        {isEvmChain(chainId) && isEvmCurrency(currency) ? (
          <CurrencyLogo currency={currency} size="24px" />
        ) : (
          <img src={'logo' in currency ? currency.logo : undefined} width={24} height={24} alt="" />
        )}
        <span className="text-xl font-medium">{currency?.symbol}</span>
      </HStack>
    </SwapReviewAmountCard>
  )
}

type CrossChainSwapConfirmationProps = {
  quote: ReviewedQuote | null
  isOpen: boolean
  submission: CrossChainSubmission
  hasVeryHighPriceImpact: boolean
  onConfirm?: () => void
  onDismiss?: () => void
}

export const CrossChainSwapConfirmation = ({
  quote: reviewedQuote,
  isOpen,
  submission,
  hasVeryHighPriceImpact,
  onConfirm,
  onDismiss,
}: CrossChainSwapConfirmationProps) => {
  if (!reviewedQuote) return null

  const phase = submission.phase
  const isSubmitting = phase === Phase.PREPARING || phase === Phase.SIGNING
  const isSubmitted = submission.phase === 'submitted'
  const txHash = isSubmitted ? submission.txHash : ''

  const {
    fromChain: fromChainId,
    toChain: toChainId,
    fromToken: currencyIn,
    toToken: currencyOut,
    amount: amountInWei,
    recipient,
    sender,
    slippage,
  } = reviewedQuote.quote.quoteParams

  const amount = formatUnits(BigInt(amountInWei), currencyIn.decimals)
  const input: SwapStatusAmount = { currency: currencyIn, chainId: fromChainId, amount }
  const output: SwapStatusAmount = {
    currency: currencyOut,
    chainId: toChainId,
    amount: reviewedQuote.quote.formattedOutputAmount,
  }

  const hasDifferentRecipient =
    !!sender &&
    (isEvmChain(fromChainId) && isEvmChain(toChainId)
      ? recipient.toLowerCase() !== sender.toLowerCase()
      : recipient !== sender)

  const warning = getQuoteWarning({
    selectedQuote: reviewedQuote,
    category: reviewedQuote.category,
    isEvmPair: isEvmChain(fromChainId) && isEvmChain(toChainId),
    slippage,
  })

  return (
    <TransactionConfirmationModal
      isOpen={isSubmitting || isOpen}
      onDismiss={() => onDismiss?.()}
      {...(isSubmitted
        ? {
            mode: Mode.SUBMITTED,
            txHash: submission.txHash,
            explorerUrl:
              fromChainId === NonEvmChain.Solana
                ? `https://solscan.io/tx/${txHash}`
                : fromChainId === NonEvmChain.Near
                ? `https://nearblocks.io/txns/${txHash}`
                : fromChainId === NonEvmChain.Bitcoin
                ? `https://mempool.space/tx/${txHash}`
                : getEtherscanLink(fromChainId, txHash, 'transaction'),
          }
        : isSubmitting
        ? { mode: Mode.PENDING, phase }
        : { mode: Mode.CUSTOM })}
    >
      {isSubmitted || isSubmitting ? (
        <SwapStatusAmounts input={input} output={output} gasDrop={reviewedQuote.quote.gasDrop} />
      ) : submission.phase === 'error' ? (
        <TransactionErrorContent message={submission.error} onDismiss={() => onDismiss?.()} />
      ) : (
        <Stack className="w-full gap-4 p-4 sm:p-5">
          <SwapReviewHeader
            title={t`Confirm Swap Details`}
            subtitle={t`Please review the details of your swap`}
            onDismiss={() => onDismiss?.()}
          />
          <Stack className="gap-1">
            <CrossChainReviewRate quote={reviewedQuote} />
            <Stack className="min-w-0 gap-2">
              <CrossChainReviewAmount
                label={t`Input Amount`}
                chainId={fromChainId}
                currency={currencyIn}
                amount={amount}
                amountUsd={reviewedQuote.quote.inputUsd}
              />
              <CrossChainReviewAmount
                label={t`Output Amount`}
                isOutput
                chainId={toChainId}
                currency={currencyOut}
                amount={reviewedQuote.quote.formattedOutputAmount}
                amountUsd={reviewedQuote.quote.outputUsd}
                gasDrop={reviewedQuote.quote.gasDrop}
              />
            </Stack>
          </Stack>
          <Stack className="gap-2 px-2 py-1 text-xs">
            <CrossChainQuoteSummaryRows
              quote={reviewedQuote}
              tokenOut={currencyOut}
              slippage={slippage}
              warning={warning}
              showEstimatedTime={false}
            />
            <Divider className="my-1 bg-border/40" />
            <HStack className="min-h-5 flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-subText">{t`Recipient`}</span>
              <HStack className="min-w-0 items-center gap-1 text-xs font-medium">
                <NetworkLogo chainId={toChainId} alt="network icon" width="14px" height="14px" />
                <ExternalLinkNoLineHeight
                  className={cn(
                    'min-w-0 break-all underline [text-decoration-style:dotted]',
                    hasDifferentRecipient ? 'text-primary' : 'text-text',
                  )}
                  href={
                    toChainId === NonEvmChain.Solana
                      ? `https://solscan.io/account/${recipient}`
                      : toChainId === NonEvmChain.Near
                      ? `https://nearblocks.io/address/${recipient}`
                      : toChainId === NonEvmChain.Bitcoin
                      ? `https://mempool.space/address/${recipient}`
                      : getEtherscanLink(toChainId, recipient, 'address')
                  }
                >
                  {recipient.includes('.near') ? recipient : shortenHash(recipient, 4)}
                </ExternalLinkNoLineHeight>
                <CopyHelper toCopy={recipient} margin="0" />
              </HStack>
            </HStack>
          </Stack>

          <CrossChainPriceImpactWarning warning={warning} />

          <Stack className="gap-2">
            <ButtonPrimary
              disabled={isSubmitting}
              onClick={onConfirm}
              className={hasVeryHighPriceImpact && !isSubmitting ? '!bg-red !text-text' : undefined}
            >
              {hasVeryHighPriceImpact ? t`Swap Anyway` : t`Confirm Swap`}
            </ButtonPrimary>

            <span className="block text-center text-xs font-medium text-gray">
              <Trans>Routed via</Trans> <QuoteProviderName quote={reviewedQuote} showIcon={false} />
            </span>
          </Stack>
        </Stack>
      )}
    </TransactionConfirmationModal>
  )
}
