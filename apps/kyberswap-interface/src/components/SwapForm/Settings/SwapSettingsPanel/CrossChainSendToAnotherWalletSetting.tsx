import { useCrossChainSwap } from 'components/SwapForm/CrossChain/CrossChainSwapProvider'
import { SendToAnotherWalletSetting } from 'components/SwapForm/Settings/SwapSettingsPanel/SendToAnotherWalletSetting'

const CrossChainSendToAnotherWalletSetting = ({ onApply }: { onApply: () => void }) => {
  const { recipientInputValue, applyRecipient, toChainId, recipientAddressType } = useCrossChainSwap()

  return (
    <SendToAnotherWalletSetting
      key={toChainId}
      trackingScope="cross-chain"
      recipientInputValue={recipientInputValue}
      {...recipientAddressType}
      onApply={value => {
        applyRecipient(value)
        onApply()
      }}
    />
  )
}

export default CrossChainSendToAnotherWalletSetting
