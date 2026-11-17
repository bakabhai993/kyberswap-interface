import { t } from '@lingui/macro'
import { useWalletSelector } from '@near-wallet-selector/react-hook'
import type { SignerWalletAdapter } from '@solana/wallet-adapter-base'
import { useConnection } from '@solana/wallet-adapter-react'
import { Transaction, VersionedTransaction } from '@solana/web3.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { useLazyCheckBlackjackQuery } from 'services/blackjack'
import { adaptRelaySolanaWallet } from 'services/crossChain/adapters/RelayAdapter/relaySolanaWallet'
import { type Quote } from 'services/crossChain/registry'
import { getSwapTrackingData } from 'services/crossChain/tracking'
import { getChainName, isQuoteExecutable } from 'services/crossChain/utils'
import { formatUnits } from 'viem'

import {
  observeEvmWalletSigning,
  observeWalletSigning,
} from 'components/SwapForm/CrossChain/Execution/observeWalletSigning'
import { getQuoteTracking } from 'components/SwapForm/CrossChain/quoteTracking'
import { useSwapWallets } from 'components/SwapWallets/SwapWalletContext'
import { getTipLinkAttribution } from 'components/TipLinkGeneratorModal/shared'
import { useGatedWalletClient } from 'hooks/useGatedWalletClient'
import useTracking, { CROSS_CHAIN_MIXPANEL_TYPE, TRACKING_EVENT_TYPE, useCrossChainMixpanel } from 'hooks/useTracking'
import type { AppState } from 'state'
import { addTransaction, enqueueTransactionSync, selectTransactionSync } from 'state/crossChainSwap'
import { outboxKey } from 'state/crossChainSwap/model'
import { useAppDispatch } from 'state/hooks'
import { NonEvmChain, type NormalizedTxResponse, isEvmChain } from 'types/crossChain'

export type CrossChainSubmission =
  | { phase: 'idle' | 'preparing' | 'signing' }
  | { phase: 'submitted'; txHash: string }
  | { phase: 'error'; error: string }

/** Executes the reviewed quote with the input signing slot and persists broadcasts independently of review UI. */
export const useCrossChainExecution = (reviewedQuote: Quote | null, { onSubmit }: { onSubmit?: () => void } = {}) => {
  const { crossChainMixpanelHandler } = useCrossChainMixpanel()
  const { trackingHandler } = useTracking()
  const { data: walletClient } = useGatedWalletClient()

  const [searchParams] = useSearchParams()
  const [submission, setSubmission] = useState<CrossChainSubmission>({ phase: 'idle' })
  const submissionPhase = submission.phase
  const isSubmitting = submissionPhase === 'preparing' || submissionPhase === 'signing'
  const txHash = submission.phase === 'submitted' ? submission.txHash : ''
  const txError = submission.phase === 'error' ? submission.error : ''

  const activeSubmission = useRef<symbol | null>(null)

  const dispatch = useAppDispatch()
  const store = useStore<AppState>()

  const nearWallet = useWalletSelector()
  const swapWallets = useSwapWallets()
  const [checkBlackjack] = useLazyCheckBlackjackQuery()
  const { connection } = useConnection()

  const inputConnection = swapWallets?.inputConnection
  const inputAddress = swapWallets?.inputAddress

  const solanaAdapter = inputConnection?.family === NonEvmChain.Solana ? inputConnection.wallet : undefined
  const solanaSigner = solanaAdapter as Partial<SignerWalletAdapter> | undefined
  const activeSolanaWallet = solanaAdapter
    ? {
        publicKey: solanaAdapter.publicKey,
        signTransaction: solanaSigner?.signTransaction?.bind(solanaAdapter),
        signAllTransactions: solanaSigner?.signAllTransactions?.bind(solanaAdapter),
      }
    : {}
  const solanaAddress = solanaAdapter?.publicKey
  const sendTransaction =
    inputConnection?.family === NonEvmChain.Solana
      ? inputConnection.wallet.sendTransaction.bind(inputConnection.wallet)
      : async () => {
          throw new Error('Solana wallet not connected')
        }
  const activeNearWallet =
    inputConnection?.family === NonEvmChain.Near
      ? { ...nearWallet, wallet: inputConnection.wallet, signedAccountId: inputAddress || null }
      : { ...nearWallet, wallet: null, signedAccountId: null }
  const activeBitcoinWallet = inputConnection?.family === NonEvmChain.Bitcoin ? inputConnection.wallet : undefined

  const sendBtcFn = async (
    params: { recipient: string; amount: string | number },
    onSigning: (signing: boolean) => void,
  ) => {
    const feeRate = await fetch('https://mempool.space/api/v1/fees/recommended').then(res => res.json())

    const selectedWallet = activeBitcoinWallet
    if (!selectedWallet) throw new Error('Not connected wallet')

    return observeWalletSigning(selectedWallet, ['sendBitcoin'], onSigning).sendBitcoin({
      ...params,
      sender: inputAddress,
      ...(feeRate?.fastestFee
        ? {
            options: { feeRate: feeRate.fastestFee * 1.2 },
          }
        : {}),
    })
  }

  const submitSwap = async () => {
    const selectedQuote = reviewedQuote
    if (!selectedQuote || activeSubmission.current) return

    onSubmit?.()

    const {
      fromChain: fromChainId,
      toChain: toChainId,
      fromToken: currencyIn,
      toToken: currencyOut,
      amount: amountInWei,
      sender,
      recipient: receiver,
    } = selectedQuote.quote.quoteParams
    const amount = formatUnits(BigInt(amountInWei), currencyIn.decimals)

    if (isEvmChain(fromChainId) && !walletClient) {
      setSubmission({ phase: 'error', error: t`The route is outdated. Please refresh and try again.` })
      return
    }

    // Check the live signer against the immutable reviewed quote before opening the wallet.
    const executionSender = inputAddress || undefined

    if (
      (isEvmChain(fromChainId) && walletClient?.account.address.toLowerCase() !== executionSender?.toLowerCase()) ||
      !executionSender ||
      !isQuoteExecutable(selectedQuote, executionSender, receiver)
    ) {
      setSubmission({ phase: 'error', error: t`The route is outdated. Please refresh and try again.` })
      return
    }

    const submissionId = Symbol('cross-chain submission')
    activeSubmission.current = submissionId
    const isCurrentSubmission = () => activeSubmission.current === submissionId

    const attempt = getQuoteTracking(selectedQuote)
    trackingHandler(TRACKING_EVENT_TYPE.SWAP_CONFIRM_CLICKED, attempt)
    setSubmission({ phase: 'preparing' })

    let broadcastHash = ''
    let acceptedOrderId: string | undefined
    let capturedOutboxKey: string | undefined

    const onSigning = (signing: boolean) => {
      if (isCurrentSubmission() && !broadcastHash) setSubmission({ phase: signing ? 'signing' : 'preparing' })
    }
    const executionWallet = walletClient ? observeEvmWalletSigning(walletClient, onSigning) : walletClient
    const executionSolanaWallet = observeWalletSigning(
      activeSolanaWallet,
      ['signTransaction', 'signAllTransactions'],
      onSigning,
    )
    const executionNearWallet = {
      ...activeNearWallet,
      wallet: activeNearWallet.wallet
        ? observeWalletSigning(
            activeNearWallet.wallet,
            ['signAndSendTransactions', 'signAndSendTransaction'],
            onSigning,
          )
        : activeNearWallet.wallet,
    }
    const executionSendTransaction = observeWalletSigning(
      { sendTransaction },
      ['sendTransaction'],
      onSigning,
    ).sendTransaction

    const adaptedWallet = adaptRelaySolanaWallet(
      solanaAddress?.toString() || '1nc1nerator11111111111111111111111111111111',
      792703809, //chain id that Relay uses to identify solana
      connection,
      async (transaction, options) => {
        try {
          if (transaction instanceof VersionedTransaction || transaction instanceof Transaction) {
            const signature = await executionSendTransaction(transaction, connection, options)
            return { signature }
          } else {
            throw new Error('Invalid transaction type')
          }
        } catch (error) {
          console.error('Transaction sending failed:', error)
          throw error
        }
      },
    )

    // Broadcast persistence survives review dismissal; only UI updates depend on this submission still being current.
    const persistBroadcast = (transaction: NormalizedTxResponse) => {
      const alreadyCaptured = broadcastHash === transaction.sourceTxHash
      broadcastHash = transaction.sourceTxHash

      if (selectedQuote.quote.quoteId && selectedQuote.quote.quoteToken) {
        // Fast BE settlement can clear sync while retaining the local transaction.
        // A late adapter confirmation must not restart registration.
        if (alreadyCaptured && capturedOutboxKey && !selectTransactionSync(store.getState(), capturedOutboxKey)) return

        dispatch(
          enqueueTransactionSync({
            quoteId: selectedQuote.quote.quoteId,
            quoteToken: selectedQuote.quote.quoteToken,
            sender: executionSender,
            transaction: { ...transaction, sender: executionSender || transaction.sender },
          }),
        )
        capturedOutboxKey = outboxKey(
          executionSender || transaction.sender,
          transaction.sourceChain,
          transaction.sourceTxHash,
          selectedQuote.quote.quoteId,
        )
      }

      dispatch(addTransaction({ ...transaction, sender: executionSender || transaction.sender }))
      if (isCurrentSubmission()) setSubmission({ phase: 'submitted', txHash: broadcastHash })
      if (alreadyCaptured) return

      const swapDetails = {
        ...attempt,
        ...getSwapTrackingData({
          ...transaction,
          inputAmount: amount,
          outputAmount: selectedQuote.quote.outputAmount.toString(),
          sourceChain: fromChainId,
          targetChain: toChainId,
          sourceToken: currencyIn,
          targetToken: currencyOut,
          adapter: selectedQuote.adapter.getName(),
          sender,
        }),
        target_tx_hash: undefined,
        status: 'init',
        time: Date.now(),
        timestamp: Date.now(),
      }
      crossChainMixpanelHandler(CROSS_CHAIN_MIXPANEL_TYPE.CROSS_CHAIN_SWAP_INIT, swapDetails)
      trackingHandler(TRACKING_EVENT_TYPE.SWAP_SUBMITTED, swapDetails)

      // Tip is not charged on cross-chain swaps — attribute referral volume at initiation
      // (completion fires from an off-page poller that has lost the tip-link URL context).
      const tipLink = getTipLinkAttribution(searchParams)
      if (tipLink) {
        trackingHandler(TRACKING_EVENT_TYPE.TIP_LINK_TRADE, {
          trade_type: 'cross_chain',
          trade_status: 'initiated',
          tip_charged: false,
          ...tipLink,
          input_token: currencyIn?.symbol,
          output_token: currencyOut?.symbol,
          pair: currencyIn?.symbol && currencyOut?.symbol ? `${currencyIn.symbol}/${currencyOut.symbol}` : undefined,
          chain: getChainName(fromChainId),
          from_chain: getChainName(fromChainId),
          to_chain: getChainName(toChainId),
          volume: selectedQuote.quote.inputUsd,
          tx_hash: transaction.sourceTxHash,
        })
      }
    }

    try {
      if (isEvmChain(fromChainId)) {
        const blackjackRes = await checkBlackjack(sender)
        if (blackjackRes?.data?.blacklisted) {
          throw new Error(t`There was an error with your transaction.`)
        }
      }

      const res = await selectedQuote.adapter.executeSwap(
        selectedQuote,
        fromChainId === 'solana'
          ? selectedQuote.adapter.getName() === 'Relay' // for backward compatibility
            ? adaptedWallet
            : (executionSolanaWallet as any)
          : (executionWallet as any),
        executionNearWallet,
        params => sendBtcFn(params, onSigning),
        executionSendTransaction,
        connection,
        (sourceTxHash, tracking) => {
          if (!sourceTxHash) return

          persistBroadcast({
            sourceTxHash,
            id: tracking?.id ?? sourceTxHash,
            depositAddress: tracking?.depositAddress,
            sender: executionSender || sender,
            adapter: selectedQuote.adapter.getName(),
            sourceChain: fromChainId,
            targetChain: toChainId,
            sourceToken: currencyIn,
            targetToken: currencyOut,
            inputAmount: amountInWei,
            outputAmount: selectedQuote.quote.outputAmount.toString(),
            timestamp: Date.now(),
            amountInUsd: selectedQuote.quote.inputUsd,
            amountOutUsd: selectedQuote.quote.outputUsd,
            platformFeePercent: selectedQuote.quote.platformFeePercent,
            recipient: receiver,
          })
        },
      )

      if (
        res?.sourceTxHash === 'GasRefuel cancelled' ||
        res?.sourceTxHash === 'Rejected' ||
        res?.sourceTxHash?.includes('Not enough ETH for gas')
      ) {
        throw new Error(res.sourceTxHash)
      }

      acceptedOrderId = res?.id
      if (!res) throw new Error('Source transaction hash is unavailable')
      if (res) {
        const enriched = {
          ...res,
          // Bind reconciliation to the signer that actually broadcast the tx;
          // review-time quote params may be stale after a wallet switch.
          sender: executionSender || res.sender,
          amountInUsd: selectedQuote.quote.inputUsd,
          amountOutUsd: selectedQuote.quote.outputUsd,
          platformFeePercent: selectedQuote.quote.platformFeePercent,
          recipient: receiver,
        }

        if (!enriched.sourceTxHash) throw new Error('Source transaction hash is unavailable')

        persistBroadcast(enriched)
      }
    } catch (error) {
      const errorMessage =
        (typeof error === 'string' ? error : error?.message) || t`An error occurred. Refresh the page and try again.`

      // A confirmation timeout is not a failed submission. Its captured hash
      // remains in the outbox and the independent status controller continues.
      if (broadcastHash) return

      if (isCurrentSubmission()) setSubmission({ phase: 'error', error: errorMessage })

      if (acceptedOrderId) return
      trackingHandler(TRACKING_EVENT_TYPE.SWAP_FAILED, {
        ...attempt,
        from_token: currencyIn.symbol,
        to_token: currencyOut.symbol,
        from_chain: fromChainId,
        from_chain_name: getChainName(fromChainId),
        to_chain: toChainId,
        to_chain_name: getChainName(toChainId),
        error_message: errorMessage,
        routing_source: selectedQuote.adapter.getName(),
      })
    } finally {
      if (isCurrentSubmission()) {
        activeSubmission.current = null
        setSubmission(previous =>
          previous.phase === 'preparing' || previous.phase === 'signing' ? { phase: 'idle' } : previous,
        )
      }
    }
  }

  const resetSubmission = useCallback(() => {
    // Closing a review detaches its UI; an in-flight transaction still records its result in history.
    activeSubmission.current = null
    setSubmission({ phase: 'idle' })
  }, [])

  useEffect(() => {
    resetSubmission()

    return () => {
      activeSubmission.current = null
    }
  }, [reviewedQuote, resetSubmission])

  return { submission, isSubmitting, submissionPhase, txHash, txError, submitSwap, resetSubmission }
}
