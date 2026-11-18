import { ChainId, Currency, CurrencyAmount } from '@kyberswap/ks-sdk-core'
import { Trans, t } from '@lingui/macro'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { ButtonConfirmed, ButtonLight, ButtonPrimary } from 'components/Button'
import InfoHelper from 'components/InfoHelper'
import Loader from 'components/Loader'
import { HStack, Stack } from 'components/Stack'
import SingleChainSwapReview from 'components/SwapForm/SingleChain/SingleChainSwapReview'
import AllowanceSelector, { AllowanceType } from 'components/SwapForm/SwapActionButton/AllowanceSelector'
import type { BuildReview, SubmitReview, SwapReviewState } from 'components/SwapForm/hooks/useSwapReviewSession'
import { getSingleChainAction } from 'components/SwapForm/swapAction'
import { useActiveWeb3React } from 'hooks'
import { ApprovalState, useApproveCallback } from 'hooks/useApproveCallback'
import { NETWORKS_INFO } from 'hooks/useChainsConfig'
import useIsWalletRestoring from 'hooks/useIsWalletRestoring'
import { PermitState, usePermit } from 'hooks/usePermit'
import { restrictedTokenMessage, useIsTokenRestricted } from 'hooks/useRestrictedTokens'
import useTheme from 'hooks/useTheme'
import useTracking, { TRACKING_EVENT_TYPE } from 'hooks/useTracking'
import { WrapType } from 'hooks/useWrapCallback'
import { useChangeNetwork } from 'hooks/web3/useChangeNetwork'
import { useWalletModalToggle } from 'state/application/hooks'
import { DetailedRouteSummary } from 'types/route'
import { paysNativeOnSwap } from 'utils/nativeErc20'

const ApprovalTooltip = ({
  currency,
  allowance,
  walletKey,
}: {
  currency: Currency | undefined
  allowance: CurrencyAmount<Currency> | undefined
  walletKey: string
}) => {
  const walletHelpUrl =
    walletKey === 'METAMASK'
      ? 'https://support.metamask.io/hc/en-us/articles/6055177143579-How-to-customize-token-approvals-with-a-spending-cap'
      : walletKey === 'TRUST_WALLET'
      ? 'https://community.trustwallet.com/t/what-is-token-approval/242764'
      : undefined

  if (allowance?.greaterThan(0) && walletHelpUrl) {
    return (
      <Trans>
        Approve <b>{currency?.symbol}</b> requires to be more than <b>{`${allowance.toExact()} ${currency?.symbol}`}</b>
        , find out more{' '}
        <a href={walletHelpUrl} target="_blank" rel="noreferrer">
          here
        </a>
      </Trans>
    )
  }

  return (
    <Trans>
      You need to first allow KyberSwap&apos;s smart contract to use your {currency?.symbol}.{' '}
      <a
        href="https://docs.kyberswap.com/kyberswap-solutions/kyberswap-interface/user-guides/instantly-swap-at-superior-rates#step-4-approve-contract-to-swap-tokens"
        target="_blank"
        rel="noreferrer"
      >
        Read more ↗
      </a>
    </Trans>
  )
}

type Props = {
  isCurrencyLoading?: boolean
  isGettingRoute: boolean

  parsedAmountFromTypedValue: CurrencyAmount<Currency> | undefined
  routeSummary: DetailedRouteSummary | undefined

  currencyIn: Currency | undefined
  currencyOut: Currency | undefined
  balanceIn: CurrencyAmount<Currency> | undefined
  balanceOut: CurrencyAmount<Currency> | undefined

  swapInputError: string | undefined
  wrapInputError: string | undefined
  wrapType: WrapType

  review: SwapReviewState
  openReviewSession: (build: BuildReview) => Promise<void>
  rebuildReviewSession: (build: BuildReview) => Promise<void>
  confirmReviewSession: (submit: SubmitReview, onError: (message: string) => void) => Promise<void>
  dismissReviewSession: () => void
  onWrap?: () => Promise<string | undefined>
  buildRoute: BuildReview
  customChainId?: ChainId
  chainError?: string
}

const SwapActionButton = ({
  isCurrencyLoading = false,
  isGettingRoute,

  parsedAmountFromTypedValue,
  routeSummary,

  currencyIn,
  currencyOut,
  balanceIn,
  balanceOut,

  swapInputError,
  wrapInputError,
  wrapType,

  review,
  openReviewSession,
  rebuildReviewSession,
  confirmReviewSession,
  dismissReviewSession,
  onWrap,
  buildRoute,
  customChainId,
  chainError,
}: Props) => {
  const isProcessingSwap = review.phase !== 'closed'
  const theme = useTheme()
  const { changeNetwork } = useChangeNetwork()
  const { account, walletKey, chainId, networkInfo } = useActiveWeb3React()
  const { trackingHandler } = useTracking()
  const noRouteFound = routeSummary && !routeSummary.route
  const isSamePair = !!currencyIn && !!currencyOut && currencyIn.equals(currencyOut)

  const toggleWalletModal = useWalletModalToggle()
  const isWalletRestoring = useIsWalletRestoring()
  const pendingConnection = !account && isWalletRestoring

  const isTokenRestricted = useIsTokenRestricted()
  const restrictedCurrency = isTokenRestricted(currencyIn)
    ? currencyIn
    : isTokenRestricted(currencyOut)
    ? currencyOut
    : undefined

  const showWrap: boolean = wrapType !== WrapType.NOT_APPLICABLE

  const userHasSpecifiedInputOutput = Boolean(
    currencyIn && currencyOut && parsedAmountFromTypedValue && !parsedAmountFromTypedValue.equalTo(0),
  )

  const handleApprovalError = useCallback(
    (errorInfo: { message: string; tokenSymbol?: string; tokenAddress?: string; spender?: string }) => {
      trackingHandler(TRACKING_EVENT_TYPE.TOKEN_APPROVAL_FAILED, {
        token_symbol: errorInfo.tokenSymbol,
        token_address: errorInfo.tokenAddress,
        spender_address: errorInfo.spender,
        error_message: errorInfo.message,
        chain: networkInfo?.name,
      })
    },
    [trackingHandler, networkInfo?.name],
  )

  // Where the native asset has a built-in ERC-20 interface, a swap is paid through the native one, so
  // the router never calls `transferFrom` and there is nothing to approve or permit. Other surfaces
  // (limit orders, zap) still move the token by allowance and keep the normal flow.
  const paysNative = paysNativeOnSwap(currencyIn)

  const [rawApproval, approveCallback, currentAllowance] = useApproveCallback({
    amount: paysNative ? undefined : parsedAmountFromTypedValue,
    spender: routeSummary?.routerAddress,
    onApprovalError: handleApprovalError,
  })
  const approval = paysNative ? ApprovalState.APPROVED : rawApproval

  const { permitState, permitCallback } = usePermit(
    paysNative ? undefined : parsedAmountFromTypedValue,
    routeSummary?.routerAddress,
  )

  const showApproveFlow =
    !swapInputError &&
    (approval === ApprovalState.NOT_APPROVED || approval === ApprovalState.PENDING) &&
    permitState !== PermitState.SIGNED

  const [loading, setLoading] = useState(false)
  const [approvalType, setApprovalType] = useState(AllowanceType.INFINITE)
  const pendingApproval = useRef<object | null>(null)
  const approvalIdentity = JSON.stringify([
    account,
    walletKey,
    chainId,
    currencyIn?.wrapped.address,
    routeSummary?.routerAddress,
    parsedAmountFromTypedValue?.toExact(),
  ])

  const ApproveButton = permitState === PermitState.NOT_SIGNED ? ButtonLight : ButtonPrimary

  const action = getSingleChainAction({
    tokensLoading: isCurrencyLoading,
    hasTokens: !!currencyIn && !!currencyOut,
    pairError: restrictedCurrency
      ? restrictedTokenMessage(restrictedCurrency.symbol)
      : isSamePair
      ? t`Select a different pair`
      : undefined,
    hasAmount: userHasSpecifiedInputOutput,
    chainError,
    walletRestoring: pendingConnection,
    connected: !!account,
    wrongNetwork: !!customChainId && customChainId !== chainId,
    selectTokenLabel: t`Select a token`,
    enterAmountLabel: t`Enter an amount`,
    wrapError: wrapInputError,
    isWrap: showWrap,
    noRoute: !!(userHasSpecifiedInputOutput && noRouteFound),
    inputError: swapInputError,
    needsApproval: showApproveFlow,
  })
  const showSwapButton = action.type === 'review'

  const requestApproval = async (request: () => Promise<unknown>) => {
    if (pendingApproval.current || approval === ApprovalState.PENDING) return

    const pending = {}
    pendingApproval.current = pending
    setLoading(true)

    try {
      await request()
    } finally {
      if (pendingApproval.current === pending) {
        pendingApproval.current = null
        setLoading(false)
      }
    }
  }

  const handlePermitClick = () => {
    void requestApproval(() => {
      trackingHandler(TRACKING_EVENT_TYPE.PERMIT_CLICK)
      return permitCallback()
    })
  }

  const handleApproveClick = () => {
    void requestApproval(() => {
      trackingHandler(TRACKING_EVENT_TYPE.TOKEN_APPROVAL_INITIATED, {
        token_symbol: currencyIn?.symbol,
        token_address: currencyIn?.isNative ? 'NATIVE' : currencyIn?.wrapped?.address,
        spender_address: routeSummary?.routerAddress,
        approval_type: 'approve',
        approval_amount: approvalType === AllowanceType.EXACT ? parsedAmountFromTypedValue?.toExact() : 'unlimited',
        chain: networkInfo?.name,
      })

      return approveCallback(
        approvalType === AllowanceType.EXACT && parsedAmountFromTypedValue ? parsedAmountFromTypedValue : undefined,
      )
    })
  }

  // Approval completions from the previous account, spender, or amount cannot update this button.
  useLayoutEffect(() => {
    pendingApproval.current = null
    setLoading(false)

    return () => {
      pendingApproval.current = null
    }
  }, [approvalIdentity, showApproveFlow])

  return (
    <>
      {action.type === 'blocked' ? (
        <ButtonPrimary
          id="swap-button"
          className={chainError && action.label === chainError ? 'whitespace-nowrap text-sm' : undefined}
          disabled
        >
          {action.label}
        </ButtonPrimary>
      ) : action.type === 'connect' ? (
        <ButtonLight onClick={toggleWalletModal}>
          <Trans>Connect</Trans>
        </ButtonLight>
      ) : action.type === 'switch-network' ? (
        <ButtonLight onClick={() => customChainId && changeNetwork(customChainId)}>
          <Trans>Switch to {NETWORKS_INFO[customChainId || chainId].name}</Trans>
        </ButtonLight>
      ) : action.type === 'wrap' ? (
        <ButtonPrimary id="swap-button" onClick={onWrap}>
          {wrapType === WrapType.WRAP ? <Trans>Wrap</Trans> : <Trans>Unwrap</Trans>}
        </ButtonPrimary>
      ) : action.type === 'approve' ? (
        <Stack className="gap-4">
          <HStack className="w-full items-center justify-between gap-4">
            {permitState === PermitState.NOT_SIGNED && (
              <ButtonConfirmed
                disabled={loading || approval === ApprovalState.PENDING}
                onClick={handlePermitClick}
                className="flex-1"
              >
                <HStack className="w-fit items-center gap-1">
                  <InfoHelper
                    margin={false}
                    className="text-textReverse"
                    placement="top"
                    text={
                      <Trans>
                        You need to first give a temporary 24H approval to KyberSwap&apos;s smart contract to use your{' '}
                        {currencyIn?.symbol}. This doesn&apos;t require a gas fees.{' '}
                        <a
                          href="https://docs.kyberswap.com/reference/permitable-tokens"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Read more ↗
                        </a>
                      </Trans>
                    }
                  />
                  <Trans>Permit {currencyIn?.symbol}</Trans>
                </HStack>
              </ButtonConfirmed>
            )}

            <ApproveButton
              onClick={handleApproveClick}
              disabled={loading || approval === ApprovalState.PENDING}
              className="flex-1 border-none"
            >
              {approval === ApprovalState.PENDING ? (
                <HStack className="flex-wrap items-center justify-center gap-1.5">
                  <Trans>Approving</Trans> <Loader className="text-border" />
                </HStack>
              ) : (
                <HStack className="w-fit items-center gap-1">
                  <InfoHelper
                    margin={false}
                    color={!loading && permitState === PermitState.NOT_SIGNED ? theme.primary : theme.textReverse}
                    placement="top"
                    text={<ApprovalTooltip currency={currencyIn} allowance={currentAllowance} walletKey={walletKey} />}
                  />
                  <Trans>Approve {currencyIn?.symbol}</Trans>
                </HStack>
              )}
            </ApproveButton>
          </HStack>
          <AllowanceSelector
            value={approvalType}
            onChange={setApprovalType}
            disabled={loading || approval === ApprovalState.PENDING}
          />
        </Stack>
      ) : null}
      {(showSwapButton || isProcessingSwap) && (
        <SingleChainSwapReview
          showButton={showSwapButton}
          routeSummary={routeSummary}
          isGettingRoute={isGettingRoute}
          currencyIn={currencyIn}
          currencyOut={currencyOut}
          balanceIn={balanceIn}
          balanceOut={balanceOut}
          parsedAmount={parsedAmountFromTypedValue}
          isPermitSwap={permitState === PermitState.SIGNED}
          isApproved={approval === ApprovalState.APPROVED || permitState === PermitState.SIGNED}
          review={review}
          openReviewSession={openReviewSession}
          rebuildReviewSession={rebuildReviewSession}
          confirmReviewSession={confirmReviewSession}
          dismissReviewSession={dismissReviewSession}
          buildRoute={buildRoute}
        />
      )}
    </>
  )
}

export default SwapActionButton
