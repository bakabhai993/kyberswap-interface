import { ChainId, Token } from '@kyberswap/ks-sdk-core'
import { Trans, t } from '@lingui/macro'
import React, { PropsWithChildren, useState } from 'react'
import { ArrowUpCircle, BarChart2 } from 'react-feather'
import { useWatchAsset } from 'wagmi'

import { ReactComponent as Alert } from 'assets/images/alert.svg'
import { ButtonLight, ButtonOutlined, ButtonPrimary } from 'components/Button'
import IconButton from 'components/Button/IconButton'
import { Collapse } from 'components/Collapse'
import { AutoColumn } from 'components/Column'
import Dots from 'components/Dots'
import Loader from 'components/Loader'
import Modal from 'components/Modal'
import { RowBetween, RowFixed } from 'components/Row'
import { HStack, Stack } from 'components/Stack'
import { CONNECTOR_ICON_OVERRIDE_MAP } from 'components/Web3Provider'
import ListGridViewGroup from 'components/YieldPools/ListGridViewGroup'
import { useActiveWeb3React, useWeb3React } from 'hooks'
import { VIEW_MODE } from 'state/user/reducer'
import { ExternalLinkNoLineHeight } from 'theme'
import { CloseIcon } from 'theme/components'
import { friendlyError } from 'utils/errorMessage'
import { getEtherscanLink } from 'utils/explorer'
import { getTokenLogoURL } from 'utils/tokenLogo'

export const Mode = {
  CUSTOM: 'custom',
  PENDING: 'pending',
  SUBMITTED: 'submitted',
} as const

export const Phase = {
  PREPARING: 'preparing',
  SIGNING: 'signing',
} as const

type PendingPhase = (typeof Phase)[keyof typeof Phase]

type TransactionStatusLayoutProps = PropsWithChildren<{
  title: React.ReactNode
  icon: React.ReactNode
  onDismiss?: () => void
  actions?: React.ReactNode
}>

const TransactionStatusLayout = ({ title, icon, onDismiss, children, actions }: TransactionStatusLayoutProps) => (
  <Stack className="w-full gap-6 overflow-y-auto p-5">
    <HStack className="items-center justify-between gap-3">
      <span className="text-xl font-medium">{title}</span>
      <IconButton aria-label={t`Close`} onClick={onDismiss}>
        <CloseIcon />
      </IconButton>
    </HStack>
    <Stack className="w-full items-center gap-4 text-center">
      <div className="flex h-12 w-full shrink-0 items-center justify-center">{icon}</div>
      {children}
    </Stack>
    {actions}
  </Stack>
)

type TransactionPendingProps = PropsWithChildren<{
  phase?: PendingPhase
  onDismiss?: () => void
}>

const TransactionPending = ({ phase = Phase.SIGNING, onDismiss, children }: TransactionPendingProps) => {
  return (
    <TransactionStatusLayout
      title={<Trans>Waiting For Confirmation</Trans>}
      icon={<Loader size="48px" className="text-primary" strokeWidth="1" />}
      onDismiss={onDismiss}
      actions={
        <ButtonOutlined onClick={onDismiss}>
          <Trans>Cancel</Trans>
        </ButtonOutlined>
      }
    >
      <Stack className="w-full items-center gap-2" role="status" aria-live="polite">
        <div className="w-full text-sm font-medium">{children}</div>
        <span className="text-sm font-medium text-subText">
          {phase === Phase.PREPARING ? (
            <Dots absolute>
              <Trans>Preparing your transaction</Trans>
            </Dots>
          ) : (
            <Dots absolute>
              <Trans>Confirm this transaction in your wallet</Trans>
            </Dots>
          )}
        </span>
      </Stack>
    </TransactionStatusLayout>
  )
}

type AddTokenToInjectedWalletProps = {
  token: Token
  chainId: ChainId
}

function AddTokenToInjectedWallet({ token, chainId }: AddTokenToInjectedWalletProps) {
  const { connector } = useWeb3React()
  // Routes wallet_watchAsset through the active connector's provider so it works for the
  // metaMask SDK on mobile (no window.ethereum) as well as desktop injected wallets.
  const { mutate: watchAsset } = useWatchAsset()

  const handleClick = () => {
    watchAsset(
      {
        type: 'ERC20',
        options: {
          address: token.address,
          symbol: token.symbol ?? '',
          decimals: token.decimals,
          image: getTokenLogoURL(token.address, chainId),
        },
      },
      {
        onError: error => {
          console.error(error)
        },
      },
    )
  }

  if (!connector || connector?.name === 'WalletConnect') return null

  const { name } = connector
  const icon = CONNECTOR_ICON_OVERRIDE_MAP[connector.id] ?? connector.icon

  return (
    <ButtonLight padding="6px 12px" width="fit-content" onClick={handleClick}>
      <RowFixed className="gap-1.5">
        <Trans>
          Add {token.symbol} to {name}
        </Trans>
        <img src={icon} className="size-4" />
      </RowFixed>
    </ButtonLight>
  )
}

type TransactionSubmittedProps = PropsWithChildren<{
  onDismiss?: () => void
  txHash: string
  explorerUrl?: string
  chainId?: ChainId
  tokenToAdd?: Token
  /** Optional follow-up offered to the left of Close, e.g. protecting the token just bought. */
  secondaryAction?: React.ReactNode
}>

const TransactionSubmitted = ({
  onDismiss,
  chainId: sourceChainId,
  txHash,
  tokenToAdd,
  children,
  explorerUrl,
  secondaryAction,
}: TransactionSubmittedProps) => {
  const { chainId: activeChainId } = useActiveWeb3React()
  const chainId = sourceChainId ?? activeChainId

  return (
    <TransactionStatusLayout
      title={<Trans>Transaction Submitted</Trans>}
      icon={<ArrowUpCircle strokeWidth={1} className="size-12 shrink-0 text-primary" />}
      onDismiss={onDismiss}
      actions={
        <Stack className="w-full items-center gap-3">
          {tokenToAdd?.address && <AddTokenToInjectedWallet token={tokenToAdd} chainId={chainId} />}
          <div className="grid w-full auto-cols-fr grid-flow-col items-stretch gap-2">
            {secondaryAction}
            <ButtonPrimary onClick={onDismiss}>
              <Trans>Close</Trans>
            </ButtonPrimary>
          </div>
        </Stack>
      }
    >
      <Stack className="w-full items-center gap-2">
        {children}
        {txHash && (
          <ExternalLinkNoLineHeight href={explorerUrl || getEtherscanLink(chainId, txHash, 'transaction')}>
            <span className="text-sm font-medium">
              <Trans>View transaction</Trans>
            </span>
          </ExternalLinkNoLineHeight>
        )}
      </Stack>
    </TransactionStatusLayout>
  )
}

type ConfirmationModalContentProps = {
  title: string
  showGridListOption?: boolean
  onDismiss?: () => void
  topContent: () => React.ReactNode
  bottomContent: () => React.ReactNode
}

export function ConfirmationModalContent({
  title,
  showGridListOption = false,
  bottomContent,
  onDismiss,
  topContent,
}: ConfirmationModalContentProps) {
  return (
    <div className="w-full overflow-y-auto">
      <AutoColumn className="p-5">
        <RowBetween>
          <span className="text-xl font-medium">{title}</span>
          <div className="flex items-center gap-[18px]">
            {showGridListOption && <ListGridViewGroup customIcons={{ [VIEW_MODE.GRID]: <BarChart2 size="28px" /> }} />}
            <CloseIcon onClick={onDismiss} />
          </div>
        </RowBetween>
        {topContent()}
      </AutoColumn>

      <AutoColumn className="gap-0 rounded-b-[20px] px-5 pb-7 pt-0">{bottomContent()}</AutoColumn>
    </div>
  )
}

type TransactionErrorContentProps = {
  message: string
  onDismiss?: () => void
  confirmAction?: () => void
  confirmText?: string
  confirmBtnStyle?: React.CSSProperties
  dismissBtnStyle?: React.CSSProperties
  suggestionMessage?: React.ReactNode
}

export const TransactionErrorContent = ({
  message,
  onDismiss,
  confirmAction,
  confirmText,
  confirmBtnStyle,
  dismissBtnStyle,
  suggestionMessage,
}: TransactionErrorContentProps) => {
  const [showDetail, setShowDetail] = useState<boolean>(false)

  return (
    <TransactionStatusLayout
      title={<Trans>Error</Trans>}
      icon={<Alert className="size-12 shrink-0" />}
      onDismiss={onDismiss}
      actions={
        <HStack className="w-full gap-2">
          {confirmAction && confirmText ? (
            <ButtonOutlined onClick={onDismiss} style={dismissBtnStyle}>
              <Trans>Dismiss</Trans>
            </ButtonOutlined>
          ) : (
            <ButtonPrimary onClick={onDismiss} style={dismissBtnStyle}>
              <Trans>Dismiss</Trans>
            </ButtonPrimary>
          )}
          {confirmAction && confirmText && (
            <ButtonPrimary onClick={confirmAction} style={confirmBtnStyle}>
              {confirmText}
            </ButtonPrimary>
          )}
        </HStack>
      }
    >
      <Stack className="w-full items-center gap-2">
        <span className="text-base font-medium text-red">{friendlyError(message)}</span>
        {message !== friendlyError(message) && (
          <Stack className="w-full items-center">
            <button
              type="button"
              className="text-sm font-medium text-primary hover:text-primary/80"
              onClick={() => setShowDetail(prev => !prev)}
            >
              {showDetail ? t`Show less` : t`Show more`}
            </button>
            <Collapse open={showDetail} className="w-full" contentGap={2}>
              <div className="max-h-[200px] w-full overflow-y-scroll break-words rounded bg-buttonBlack/40 p-2 text-center text-xs font-medium text-subText">
                {typeof message === 'string' ? message : JSON.stringify(message)}
              </div>
            </Collapse>
          </Stack>
        )}
        {suggestionMessage}
      </Stack>
    </TransactionStatusLayout>
  )
}

type Props = PropsWithChildren<{
  isOpen?: boolean
  onDismiss?: () => void
}> &
  (
    | { mode: typeof Mode.CUSTOM }
    | { mode: typeof Mode.PENDING; phase: PendingPhase }
    | {
        mode: typeof Mode.SUBMITTED
        txHash: string
        chainId?: ChainId
        explorerUrl?: string
        tokenToAdd?: Token
        secondaryAction?: React.ReactNode
      }
  )

const TransactionConfirmationModal = (props: Props) => {
  const { isOpen = false, onDismiss, children } = props

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} maxHeight={90}>
      {props.mode === Mode.PENDING ? (
        <TransactionPending phase={props.phase} onDismiss={onDismiss}>
          {children}
        </TransactionPending>
      ) : props.mode === Mode.SUBMITTED ? (
        <TransactionSubmitted
          txHash={props.txHash}
          chainId={props.chainId}
          explorerUrl={props.explorerUrl}
          tokenToAdd={props.tokenToAdd}
          secondaryAction={props.secondaryAction}
          onDismiss={onDismiss}
        >
          {children}
        </TransactionSubmitted>
      ) : (
        children
      )}
    </Modal>
  )
}

export default TransactionConfirmationModal
