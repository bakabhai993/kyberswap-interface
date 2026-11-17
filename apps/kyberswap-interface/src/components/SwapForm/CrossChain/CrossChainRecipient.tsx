import type { ClipboardEventHandler } from 'react'

import type { useCrossChainRecipient } from 'components/SwapForm/CrossChain/hooks/useCrossChainRecipient'
import { useCrossChainSwap } from 'components/SwapForm/CrossChain/hooks/useCrossChainSwap'
import { RecipientInput } from 'components/SwapForm/RecipientInput'
import useTracking, { TRACKING_EVENT_TYPE } from 'hooks/useTracking'

export const CrossChainRecipient = () => {
  const swap = useCrossChainSwap()
  const { trackingHandler } = useTracking()
  return (
    <CrossChainRecipientInput
      {...swap}
      recipient={swap.recipientInputValue}
      hideLabel
      onToggle={() => {
        trackingHandler(TRACKING_EVENT_TYPE.CC_SEND_TO_ANOTHER_WALLET_CLICKED)
        swap.toggleRecipient()
      }}
      onPaste={() => trackingHandler(TRACKING_EVENT_TYPE.CC_ANOTHER_WALLET_PASTED)}
    />
  )
}

type Props = Pick<
  ReturnType<typeof useCrossChainRecipient>,
  'recipient' | 'recipientError' | 'recipientAddressType' | 'setRecipient' | 'showRecipientInput' | 'toggleRecipient'
> & { hideLabel?: boolean; onToggle?: () => void; onPaste?: ClipboardEventHandler<HTMLInputElement> }

export const CrossChainRecipientInput = ({
  hideLabel,
  recipient,
  recipientAddressType,
  recipientError,
  setRecipient,
  showRecipientInput,
  toggleRecipient,
  onToggle,
  onPaste,
}: Props) => (
  <RecipientInput
    {...recipientAddressType}
    hideLabel={hideLabel}
    value={recipient}
    error={recipientError}
    expanded={showRecipientInput}
    onChange={setRecipient}
    onToggle={onToggle ?? toggleRecipient}
    onPaste={onPaste}
  />
)
