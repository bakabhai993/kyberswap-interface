import { Suspense, lazy } from 'react'
import { useGetTransactionsInfiniteQuerySubscription } from 'services/walletTransactionsApi'

import { useProcessingTransactions } from 'components/SwapTransactions/Processing/useProcessingTransactions'
import { useSwapWallets } from 'components/SwapWallets/SwapWalletContext'
import { useActiveWeb3React } from 'hooks'
import { useCrossChainTransactions } from 'state/crossChainSwap'
import { useBackendTransactionUpdater } from 'state/crossChainSwap/useBackendTransactionUpdater'
import { useRestoreMyNearWalletTransaction } from 'state/crossChainSwap/useRestoreMyNearWalletTransaction'

const ProviderTransactionUpdater = lazy(() => import('./ProviderTransactionUpdater'))

const WalletHistorySubscription = ({ sender }: { sender: string }) => {
  useGetTransactionsInfiniteQuerySubscription(sender, {
    skip: !sender,
    pollingInterval: 10_000,
    refetchOnMountOrArgChange: 15,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  })
  return null
}

/** Keep settlement polling mounted while the form activates its lazy wallet providers. */
export const TransactionStatusUpdater = () => {
  const transactions = useCrossChainTransactions()
  useRestoreMyNearWalletTransaction()
  useBackendTransactionUpdater()

  // Existing transfers also need terminal enrichment after settlement, not only processing polls.
  return <Suspense fallback={null}>{transactions.length > 0 && <ProviderTransactionUpdater />}</Suspense>
}

/** Swap polls only its input wallet while History or Processing needs fresh data. */
export const WalletHistorySubscriptions = ({ showHistory }: { showHistory: boolean }) => {
  const { account } = useActiveWeb3React()
  const wallets = useSwapWallets()
  const processing = useProcessingTransactions()
  const sender = wallets
    ? wallets.inputConnection?.family === 'evm'
      ? wallets.inputAddress.toLowerCase()
      : wallets.inputAddress
    : account?.toLowerCase() ?? ''

  return showHistory || processing.length > 0 ? <WalletHistorySubscription sender={sender} /> : null
}
