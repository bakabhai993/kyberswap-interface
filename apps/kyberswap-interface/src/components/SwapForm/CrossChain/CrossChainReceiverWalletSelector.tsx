import { useCrossChainSwap } from 'components/SwapForm/CrossChain/CrossChainSwapProvider'
import { CrossChainWalletSelector } from 'components/SwapWallets/CrossChainWalletSelector'
import { useSwapWallets } from 'components/SwapWallets/SwapWalletContext'
import { CONNECTOR_ICON_OVERRIDE_MAP } from 'components/Web3Provider'
import { Chain } from 'types/crossChain'

export const CrossChainReceiverWalletSelector = ({ chain }: { chain: Chain }) => {
  const { receiverWallet, recipient, pastedRecipient, isPastedRecipient, applyRecipient, selectWalletRecipient } =
    useCrossChainSwap()
  const wallets = useSwapWallets()
  const connect = () => {
    wallets?.connectOutput(selectWalletRecipient)
  }

  return (
    <CrossChainWalletSelector
      role="receiver"
      chain={chain}
      wallet={
        receiverWallet && typeof chain === 'number'
          ? {
              ...receiverWallet,
              icon: CONNECTOR_ICON_OVERRIDE_MAP[receiverWallet.id] ?? receiverWallet.icon,
            }
          : receiverWallet
      }
      recipient={recipient}
      pastedRecipient={pastedRecipient}
      isPastedRecipient={isPastedRecipient}
      onConnect={connect}
      onDisconnect={() => wallets?.disconnectOutput()}
      onSelectWallet={selectWalletRecipient}
      onApply={applyRecipient}
    />
  )
}
