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
import { useCrossChainWalletIntent } from 'components/SwapWallets/useCrossChainWalletIntent'
import { isEvmChain } from 'types/crossChain'

export const CrossChainOutputFooter = () => {
  const swap = useCrossChainSwap()
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
      onChange={swap.setGasDropEnabled}
    />
  )
}

/** Cross-chain information and execution, independent of the shared fields. */
const CrossChainSwap = () => {
  const { currencyOut, fromChainId, toChainId, warning, recipientInputEnabled } = useCrossChainSwap()
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
      <CrossChainSwapAction />
      <BitcoinConnectModal isOpen={showBitcoin} onDismiss={() => setShowBitcoin(false)} />
    </>
  )
}

export default CrossChainSwap
