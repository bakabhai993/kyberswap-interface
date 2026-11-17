import { Trans } from '@lingui/macro'
import { useState } from 'react'

import { BitcoinConnectModal } from 'components/Header/web3/WalletModal/BitcoinConnectModal'
import { HoneypotWarning, useHoneypotWarning } from 'components/HoneypotWarning'
import { Stack } from 'components/Stack'
import { CrossChainRecipient } from 'components/SwapForm/CrossChain/CrossChainRecipient'
import { useCrossChainSwap } from 'components/SwapForm/CrossChain/CrossChainSwapProvider'
import { CrossChainSwapAction } from 'components/SwapForm/CrossChain/Execution/CrossChainSwapAction'
import { CrossChainQuoteDetails } from 'components/SwapForm/CrossChain/Quote/CrossChainQuoteDetails'
import { CrossChainPriceImpactWarning } from 'components/SwapForm/CrossChain/Quote/CrossChainQuoteSummary'
import { GasDropOption } from 'components/SwapForm/CrossChain/Quote/GasDrop'
import { QuoteProviderName } from 'components/SwapForm/CrossChain/Quote/QuoteProviderName'
import { useCrossChainWalletIntent } from 'components/SwapWallets/useCrossChainWalletIntent'
import useTracking, { TRACKING_EVENT_TYPE } from 'hooks/useTracking'
import { isEvmChain } from 'types/crossChain'

export const CrossChainOutputFooter = () => {
  const swap = useCrossChainSwap()
  const { trackingHandler } = useTracking()
  if (!swap.gasDropAvailable) return null
  return (
    <GasDropOption
      chain={swap.toChainId}
      provider={swap.selectedQuote?.adapter.getName()}
      outputSymbol={swap.currencyOut?.symbol}
      gasDrop={swap.selectedQuote?.quote.gasDrop}
      enabled={swap.gasDropEnabled}
      unsupported={swap.gasDropUnsupported}
      loading={swap.gasDropEnabled && swap.loading && !swap.selectedQuote}
      onRequest={swap.prepareGasDrop}
      onChange={enabled => {
        trackingHandler(
          enabled ? TRACKING_EVENT_TYPE.CC_GAS_DROP_SELECTED : TRACKING_EVENT_TYPE.CC_GAS_DROP_UNSELECTED,
          { provider: swap.selectedQuote?.adapter.getName(), chain: swap.toChainId },
        )
        swap.setGasDropEnabled(enabled)
      }}
    />
  )
}

/** Cross-chain information and execution, independent of the shared fields. */
const CrossChainSwap = () => {
  const { currencyOut, fromChainId, toChainId, selectedQuote, loading, warning, recipientInputEnabled } =
    useCrossChainSwap()
  const [showBitcoin, setShowBitcoin] = useState(false)
  const walletIntentModal = useCrossChainWalletIntent(fromChainId, () => setShowBitcoin(true))
  const output = currencyOut && 'isNative' in currencyOut ? currencyOut : undefined
  const showRecipient = recipientInputEnabled || (isEvmChain(fromChainId) && !!toChainId && isEvmChain(toChainId))
  const { message } = useHoneypotWarning({
    chainId: output?.chainId,
    tokenAddress: output?.wrapped.address,
    tokenSymbol: output?.symbol,
  })
  return (
    <>
      {walletIntentModal}
      <Stack className="gap-2">
        <CrossChainQuoteDetails recipient={showRecipient ? <CrossChainRecipient /> : undefined} />
        <HoneypotWarning message={message} />
        <CrossChainPriceImpactWarning warning={warning} />
      </Stack>
      <Stack className="gap-2">
        <CrossChainSwapAction />
        {!loading && selectedQuote && (
          <span className="text-center text-xs font-medium text-gray">
            <Trans>Routed via</Trans> <QuoteProviderName quote={selectedQuote} showIcon={false} />
          </span>
        )}
      </Stack>
      <BitcoinConnectModal isOpen={showBitcoin} onDismiss={() => setShowBitcoin(false)} />
    </>
  )
}

export default CrossChainSwap
