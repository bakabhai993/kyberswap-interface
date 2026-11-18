import { ChainId, CurrencyAmount } from '@kyberswap/ks-sdk-core'
import { Trans, t } from '@lingui/macro'
import { useState } from 'react'
import { KyberCross } from 'services/crossChain/adapters/KyberCrossAdapter/constants'
import { isEvmCurrency } from 'services/crossChain/quote/utils'
import { isQuoteExecutable } from 'services/crossChain/utils'

import { ButtonPrimary } from 'components/Button'
import Dots from 'components/Dots'
import { HStack, Stack } from 'components/Stack'
import { useCrossChainSwap } from 'components/SwapForm/CrossChain/CrossChainSwapProvider'
import { CrossChainSwapConfirmation } from 'components/SwapForm/CrossChain/Execution/CrossChainSwapConfirmation'
import { useCrossChainApproval } from 'components/SwapForm/CrossChain/Execution/useCrossChainApproval'
import { QuoteProviderName } from 'components/SwapForm/CrossChain/Quote/QuoteProviderName'
import { useCrossChainBalance } from 'components/SwapForm/CrossChain/hooks/useCrossChainBalance'
import AllowanceSelector, { AllowanceType } from 'components/SwapForm/SwapActionButton/AllowanceSelector'
import SwapButtonWithPriceImpact from 'components/SwapForm/SwapActionButton/SwapButtonWithPriceImpact'
import { getCrossChainAction } from 'components/SwapForm/swapAction'
import { useSwapWallets } from 'components/SwapWallets/SwapWalletContext'
import { ZERO_ADDRESS } from 'constants/index'
import { useActiveWeb3React } from 'hooks'
import { ApprovalState } from 'hooks/useApproveCallback'
import { restrictedTokenMessage, useIsTokenAddressRestricted } from 'hooks/useRestrictedTokens'
import { useChangeNetwork } from 'hooks/web3/useChangeNetwork'
import { useCurrencyBalance } from 'state/wallet/hooks'
import { NonEvmChain, isEvmChain } from 'types/crossChain'
import { getTokenAddress } from 'utils/tokenInfo'

export const CrossChainSwapAction = () => {
  const {
    showPreview,
    reviewQuote,
    openReview,
    closeReview,
    isSubmitting,
    submission,
    confirmSwap,
    priceImpactAction,
    reviewHasVeryHighPriceImpact,
    amountInWei,
    fromChainId,
    toChainId,
    currencyIn,
    currencyOut,
    loading,
    allLoading,
    selectedQuote,
    recipientMessage,
    isReadOnly,
    sender,
    receiver,
  } = useCrossChainSwap()

  const wallets = useSwapWallets()
  const { chainId } = useActiveWeb3React()
  const { changeNetwork } = useChangeNetwork()
  const isAddressRestricted = useIsTokenAddressRestricted()

  const isFromEvm = isEvmChain(fromChainId)
  const isFromNear = fromChainId === NonEvmChain.Near
  const isFromSol = fromChainId === NonEvmChain.Solana
  const isFromBitcoin = fromChainId === NonEvmChain.Bitcoin

  const evmCurrencyIn = isFromEvm && isEvmCurrency(currencyIn) ? currencyIn : undefined
  const inputAmount = evmCurrencyIn ? CurrencyAmount.fromRawAmount(evmCurrencyIn, amountInWei || '0') : undefined

  const balance = useCurrencyBalance(evmCurrencyIn, isFromEvm ? (fromChainId as ChainId) : undefined)
  const nonEvmBalance = useCrossChainBalance(fromChainId, currencyIn, isFromEvm ? undefined : wallets?.inputAddress)

  const { approvalState, approve, isApproving, isChecking, isRevalidating, revalidateAllowance } =
    useCrossChainApproval({
      amount: inputAmount,
      fromChainId,
      spender: selectedQuote?.quote.contractAddress,
    })

  const [approvalType, setApprovalType] = useState(AllowanceType.EXACT)
  const canChooseAllowance = isFromEvm && selectedQuote?.adapter.getName() === KyberCross

  const isFindingRoute = loading || (allLoading && !selectedQuote)
  const isSelectedQuoteExecutable = !isReadOnly && isQuoteExecutable(selectedQuote, sender, receiver)

  // Restricted-token check applies only to EVM sides (the restricted list is keyed by EVM chainId).
  const restrictedCurrency =
    evmCurrencyIn && isAddressRestricted(fromChainId as ChainId, getTokenAddress(evmCurrencyIn))
      ? currencyIn
      : toChainId &&
        isEvmChain(toChainId) &&
        isEvmCurrency(currencyOut) &&
        isAddressRestricted(toChainId as ChainId, getTokenAddress(currencyOut))
      ? currencyOut
      : undefined

  const connectWalletLabel = isFromBitcoin
    ? t`Connect Bitcoin Wallet`
    : isFromNear
    ? t`Connect NEAR Wallet`
    : isFromSol
    ? t`Connect Solana Wallet`
    : t`Connect Wallet`

  const requestReview = () => {
    void openReview(revalidateAllowance)
  }

  const action = getCrossChainAction({
    hasTokens: !!fromChainId && !!toChainId && !!currencyIn && !!currencyOut,
    pairError: restrictedCurrency ? restrictedTokenMessage(restrictedCurrency.symbol) : undefined,
    hasAmount: !!amountInWei && amountInWei !== '0',
    connected: !!wallets?.inputAddress,
    wrongNetwork: isFromEvm && chainId !== fromChainId,
    selectTokenLabel: t`Please select a token`,
    enterAmountLabel: t`Please input an amount`,
    approving: isApproving,
    recipientError: wallets?.inputAddress ? recipientMessage : undefined,
    findingRoute: isFindingRoute,
    checkingApproval: isChecking,
    hasQuote: !!selectedQuote,
    insufficientBalance: isFromEvm
      ? !balance || !!inputAmount?.greaterThan(balance)
      : nonEvmBalance === undefined || BigInt(nonEvmBalance) < BigInt(amountInWei || '0'),
    executable: isSelectedQuoteExecutable,
    needsApproval:
      approvalState === ApprovalState.NOT_APPROVED && selectedQuote?.quote.contractAddress !== ZERO_ADDRESS,
  })

  const showAllowanceSelector =
    (action.type === 'approve' || (action.type === 'blocked' && isApproving && action.busy)) && canChooseAllowance
  const showRouteProvider = !loading && !!selectedQuote

  const handleButtonClick = () => {
    if (action.type === 'connect') wallets?.connectInput()
    else if (action.type === 'switch-network') void changeNetwork(fromChainId as ChainId)
    else if (action.type === 'approve')
      void approve({ infinite: canChooseAllowance && approvalType === AllowanceType.INFINITE })
  }

  return (
    <>
      <CrossChainSwapConfirmation
        quote={reviewQuote}
        isOpen={showPreview}
        submission={submission}
        hasVeryHighPriceImpact={reviewHasVeryHighPriceImpact}
        onConfirm={confirmSwap}
        onDismiss={closeReview}
      />
      <Stack className="gap-2">
        {action.type === 'review' ? (
          <SwapButtonWithPriceImpact
            isProcessingSwap={showPreview || isSubmitting}
            showLoading={isRevalidating}
            priceImpactAction={priceImpactAction}
            isApproved
            hasRoute={isSelectedQuoteExecutable}
            onClick={requestReview}
          />
        ) : (
          <ButtonPrimary
            disabled={action.type === 'blocked' || (action.type === 'approve' && isRevalidating)}
            onClick={handleButtonClick}
          >
            {action.type === 'blocked' ? (
              action.busy ? (
                <Dots>{action.label}</Dots>
              ) : (
                action.label
              )
            ) : action.type === 'connect' ? (
              connectWalletLabel
            ) : action.type === 'switch-network' ? (
              t`Switch Network`
            ) : (
              t`Approve`
            )}
          </ButtonPrimary>
        )}
        {(showRouteProvider || showAllowanceSelector) && (
          <HStack
            className={`items-center gap-2 ${
              showAllowanceSelector ? (showRouteProvider ? 'justify-between' : 'justify-end') : 'justify-center'
            }`}
          >
            {showRouteProvider && selectedQuote && (
              <span className="text-center text-xs font-medium text-gray">
                <Trans>Routed via</Trans> <QuoteProviderName quote={selectedQuote} showIcon={false} />
              </span>
            )}
            {showAllowanceSelector && (
              <AllowanceSelector
                value={approvalType}
                onChange={setApprovalType}
                disabled={action.type === 'blocked' || isRevalidating}
              />
            )}
          </HStack>
        )}
      </Stack>
    </>
  )
}
