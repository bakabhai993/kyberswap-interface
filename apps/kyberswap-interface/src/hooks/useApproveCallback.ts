import { Currency, CurrencyAmount, TokenAmount } from '@kyberswap/ks-sdk-core'
import { t } from '@lingui/macro'
import { readContract } from '@wagmi/core'
import JSBI from 'jsbi'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { NotificationType } from 'components/Announcement/type'
import { wagmiConfig } from 'components/Web3Provider'
import { ERC20_ABI } from 'constants/abis'
import { useActiveWeb3React, useWeb3React } from 'hooks'
import { useNotify } from 'state/application/hooks'
import { useHasPendingApproval, useTransactionAdder } from 'state/transactions/hooks'
import { TRANSACTION_TYPE } from 'state/transactions/type'
import { friendlyError } from 'utils/errorMessage'
import { sendEVMTransaction } from 'utils/sendTransaction'
import { ErrorName } from 'utils/transactionError'
import { Address, encodeFunctionData, maxUint256 } from 'utils/viem'
import { didUserReject } from 'utils/walletError'

export enum ApprovalState {
  UNKNOWN = 'UNKNOWN',
  NOT_APPROVED = 'NOT_APPROVED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
}

type ApprovalError = {
  message: string
  tokenSymbol?: string
  tokenAddress?: string
  spender?: string
}

export enum ApprovalStatus {
  SUBMITTED = 'submitted',
  REJECTED = 'rejected',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

type UseApproveCallbackArgs = {
  amount?: CurrencyAmount<Currency>
  spender?: string
  forceApprove?: boolean
  onApprovalError?: (error: ApprovalError) => void
  /** Carried on the approval transaction into its `Token Approval Completed` event. */
  trackingPayload?: Record<string, unknown>
}

// returns a variable indicating the state of the approval and a function which approves if necessary or early returns
export function useApproveCallback({
  amount,
  spender,
  forceApprove = false,
  onApprovalError,
  trackingPayload,
}: UseApproveCallbackArgs): [
  ApprovalState,
  (customAllowance?: CurrencyAmount<Currency>) => Promise<ApprovalStatus>,
  TokenAmount | undefined,
] {
  const { account, chainId } = useActiveWeb3React()
  const { isSmartConnector } = useWeb3React()
  const token = amount?.currency.wrapped
  const pendingApproval = useHasPendingApproval(token?.address, spender)

  const allowanceScope =
    token && account && spender && chainId
      ? `${chainId}:${account}:${token.address}:${spender}`.toLowerCase()
      : undefined
  const [allowanceResult, setAllowanceResult] = useState<{ scope: string; amount: TokenAmount }>()
  const currentAllowance = allowanceResult?.scope === allowanceScope ? allowanceResult?.amount : undefined

  useEffect(() => {
    if (!token || !account || !spender || !chainId || !allowanceScope || amount?.currency.isNative) return
    let cancelled = false

    const refreshAllowance = async () => {
      try {
        const allowance = (await readContract(wagmiConfig, {
          address: token.address as Address,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [account, spender],
          chainId: chainId as number,
        })) as bigint
        if (!cancelled) {
          setAllowanceResult({ scope: allowanceScope, amount: TokenAmount.fromRawAmount(token, allowance.toString()) })
        }
      } catch {
        if (!cancelled) setAllowanceResult(undefined)
      }
    }

    void refreshAllowance()
    return () => {
      cancelled = true
    }
  }, [account, spender, token, chainId, allowanceScope, amount?.currency.isNative, pendingApproval])

  // check the current approval status
  const approvalState: ApprovalState = useMemo(() => {
    if (!amount || !spender) return ApprovalState.UNKNOWN
    if (amount.currency.isNative) return ApprovalState.APPROVED
    if (pendingApproval) return ApprovalState.PENDING
    // we might not have enough data to know whether or not we need to approve
    if (!currentAllowance) return ApprovalState.UNKNOWN

    // Handle farm approval.
    if (amount.quotient.toString() === maxUint256.toString()) {
      return currentAllowance.equalTo(JSBI.BigInt(0)) ? ApprovalState.NOT_APPROVED : ApprovalState.APPROVED
    }

    return currentAllowance.lessThan(amount) ? ApprovalState.NOT_APPROVED : ApprovalState.APPROVED
  }, [amount, currentAllowance, pendingApproval, spender])
  const notify = useNotify()

  const addTransactionWithType = useTransactionAdder()

  const approve = useCallback(
    async (customAmount?: CurrencyAmount<Currency>): Promise<ApprovalStatus> => {
      try {
        if (approvalState !== ApprovalState.NOT_APPROVED && !forceApprove) {
          console.error('approve was called unnecessarily')
          return ApprovalStatus.SKIPPED
        }
        if (!token) {
          console.error('no token')
          return ApprovalStatus.SKIPPED
        }

        if (!account) {
          console.error('no account')
          return ApprovalStatus.SKIPPED
        }

        if (!amount) {
          console.error('missing amount to approve')
          return ApprovalStatus.SKIPPED
        }

        if (!spender) {
          console.error('no spender')
          return ApprovalStatus.SKIPPED
        }

        const buildApproveData = (amount: bigint) =>
          encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender, amount],
          })

        const sendApprove = (amount: bigint) =>
          sendEVMTransaction({
            account,
            contractAddress: token.address,
            encodedData: buildApproveData(amount),
            value: 0n,
            errorInfo: { name: ErrorName.SwapError, wallet: undefined },
            isSmartConnector,
            chainId,
          })

        let response
        let approvalReset = false
        try {
          const initialAmount =
            customAmount instanceof CurrencyAmount ? BigInt(customAmount.quotient.toString()) : maxUint256
          response = await sendApprove(initialAmount)
        } catch (e) {
          // Abort the retry chain on user rejection — otherwise the wallet would
          // re-prompt with the exact-amount fallback (and again with the USDT
          // zero-reset), surfacing as 2-3 consecutive popups for one click.
          if (didUserReject(e)) {
            return ApprovalStatus.REJECTED
          }
          try {
            if (customAmount?.quotient.toString() === amount.quotient.toString()) throw e
            response = await sendApprove(BigInt(amount.quotient.toString()))
          } catch (e2) {
            if (didUserReject(e2)) {
              return ApprovalStatus.REJECTED
            }
            // USDT-style tokens require a confirmed zero allowance before setting a new one.
            // Track this transaction so callers stay pending until its receipt, then ask again.
            response = await sendApprove(0n)
            approvalReset = true
          }
        }

        if (response?.hash) {
          // Keep the caller busy until the store owns the pending transaction.
          await addTransactionWithType({
            hash: response.hash,
            type: TRANSACTION_TYPE.APPROVE,
            extraInfo: {
              tokenSymbol: token.symbol ?? '',
              tokenAddress: token.address,
              contract: spender,
              trackingPayload,
              approvalReset,
            },
          })
          // A reset is tracked, but has not submitted the requested spending permission.
          return approvalReset ? ApprovalStatus.FAILED : ApprovalStatus.SUBMITTED
        }
        return ApprovalStatus.FAILED
      } catch (error) {
        if (didUserReject(error)) return ApprovalStatus.REJECTED
        const message = friendlyError(error)
        console.error('Approve token error:', { message, error })
        onApprovalError?.({
          message,
          tokenSymbol: token?.symbol,
          tokenAddress: token?.address,
          spender,
        })
        notify(
          {
            title: t`Approve Error`,
            summary: message,
            type: NotificationType.ERROR,
          },
          8000,
        )
        return ApprovalStatus.FAILED
      }
    },
    [
      account,
      approvalState,
      token,
      amount,
      spender,
      addTransactionWithType,
      forceApprove,
      notify,
      onApprovalError,
      isSmartConnector,
      chainId,
      trackingPayload,
    ],
  )

  return [approvalState, approve, currentAllowance]
}
