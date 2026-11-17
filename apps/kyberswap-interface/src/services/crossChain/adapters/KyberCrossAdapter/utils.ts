import type {
  GasDropPlan,
  KyberCrossRawQuote,
  SwapPlan,
  TrackingExecution,
} from 'services/crossChain/adapters/KyberCrossAdapter/types'
import { evmTransactionSchema } from 'services/crossChain/quote/rawQuote'
import { normalizeAdapterName } from 'services/crossChain/utils'
import { z } from 'zod'

import {
  type GasDropQuote,
  type GasDropStatus,
  type KyberCrossPlannedSwap,
  type KyberCrossRouteSnapshot,
  type SwapStatus,
} from 'types/crossChain'

const routeSummarySchema = z
  .object({
    id: z.string(),
    expires_at: z.string(),
    tags: z.array(z.string()).optional(),
    estimated_duration_sec: z.number().optional(),
    bridge: z.object({ provider: z.string(), metadata: z.record(z.unknown()).optional() }).passthrough(),
  })
  .passthrough()

const rawQuoteSchema = z
  .object({
    request_id: z.string().optional(),
    isNativeToken: z.boolean().optional(),
    data: z
      .object({
        route_plan: routeSummarySchema.extend({ expires_at: z.string().optional() }),
        build: z.object({ tx: evmTransactionSchema }).passthrough(),
      })
      .passthrough(),
  })
  .passthrough()

// Validate the fields FE consumes; opaque bridge metadata remains owned by the build API.
export const parseKyberCrossQuote = (value: unknown): KyberCrossRawQuote => {
  rawQuoteSchema.parse(value)
  return value as KyberCrossRawQuote
}

export const getKyberCrossRoutePlan = (rawQuote: unknown) => {
  const result = rawQuoteSchema.safeParse(rawQuote)
  if (!result.success) return undefined

  const data = (rawQuote as KyberCrossRawQuote).data
  return data?.route_plan
}

// Persist only display fields, not build calldata, intents or opaque quote metadata.
export const getKyberCrossRouteSnapshot = (
  plan: NonNullable<ReturnType<typeof getKyberCrossRoutePlan>>,
): KyberCrossRouteSnapshot => {
  const snapshotSwap = (
    value?: Pick<SwapPlan, 'token_in' | 'token_out' | 'input_amount' | 'expected_output_amount'>,
  ): KyberCrossPlannedSwap | undefined => {
    if (!value) return undefined

    return {
      tokenIn: value.token_in,
      tokenOut: value.token_out,
      inputAmount: value.input_amount,
      outputAmount: value.expected_output_amount,
    }
  }

  return {
    id: plan.id,
    bridgeProvider: plan.bridge.provider,
    flowType: plan.flow_type,
    sourceSwap: snapshotSwap(plan.source_swap),
    destinationSwap: snapshotSwap(plan.dest_swap),
    gasDropSwap: snapshotSwap(plan.gas_drop_swap),
    fees: plan.fees?.flatMap(fee => {
      if (fee.expected_amount === undefined) return []

      return [{ type: fee.type, chain: fee.chain, token: fee.token, amount: fee.expected_amount }]
    }),
  }
}

export enum NormalizedProvider {
  Across = 'across',
  Relay = 'relay',
  XyFinance = 'xyfinance',
  NearIntents = 'nearintents',
  Mayan = 'mayan',
  Symbiosis = 'symbiosis',
  Debridge = 'debridge',
  Lifi = 'lifi',
  Optimex = 'optimex',
  KyberCross = 'kybercross',
  CctpV2 = 'cctpv2',
  CctpV2Fast = 'cctpv2fast',
  Ccip = 'ccip',
  Eco = 'eco',
  ArbitrumBridge = 'arbitrumbridge',
}

const normalizedProviderMap: Record<string, NormalizedProvider> = Object.values(NormalizedProvider).reduce(
  (acc, provider) => ({ ...acc, [provider]: provider }),
  {},
)

export const normalizeProvider = (provider?: string): NormalizedProvider | undefined => {
  const normalizedProvider = normalizeAdapterName(provider)

  return normalizedProvider ? normalizedProviderMap[normalizedProvider] : undefined
}

const getFinalReceivedAmount = (trackingExecution: TrackingExecution, hasGasDrop: boolean): string | undefined => {
  if (trackingExecution.route_state !== 'SUCCESS') return undefined

  const details = trackingExecution.data

  return (
    details.dest_swap?.output_amount ??
    details.withdraw?.withdraw_amount ??
    details.dest_withdraw?.withdraw_amount ??
    (hasGasDrop || details.gas_drop ? undefined : details.bridge?.dest?.amount)
  )
}

const getFinalTxHash = (trackingExecution: TrackingExecution, hasGasDrop: boolean): string => {
  if (trackingExecution.dest_tx_hash) return trackingExecution.dest_tx_hash

  const details = trackingExecution.data
  const hasDestinationAction =
    trackingExecution.flow_type === 'bridge_then_swap' ||
    trackingExecution.flow_type === 'swap_bridge_swap' ||
    !!details.dest_swap ||
    !!details.dest_withdraw ||
    !!details.withdraw ||
    !!details.gas_drop ||
    hasGasDrop

  return hasDestinationAction ? '' : details.bridge?.dest?.tx_hash || ''
}

export const getGasDropQuote = (route: { gas_drop_swap?: GasDropPlan }): GasDropQuote | undefined => {
  const gas = route.gas_drop_swap
  if (!gas) return undefined
  const summary = gas.metadata?.route_summary
  const usd = (value: unknown) => {
    const amount = Number(value)
    return Number.isFinite(amount) && amount > 0 ? amount : undefined
  }
  return {
    amount: gas.expected_output_amount,
    minAmount: gas.min_output_amount,
    amountUsd: usd(summary?.amountOutUsd),
    inputAmountUsd: usd(summary?.amountInUsd),
    inputToken: gas.token_in,
  }
}

export const isExecutionFinished = (execution: TrackingExecution) =>
  ['SUCCESS', 'FAILED', 'REFUNDED'].includes(execution.route_state)

const getGasDropStatus = (execution: TrackingExecution): GasDropStatus => {
  if (execution.data.gas_drop) return { status: 'Delivered', amount: execution.data.gas_drop.output_amount }
  if (['BRIDGE_FAILED', 'BRIDGE_EXPIRED'].includes(execution.route_state)) return { status: 'NotExecuted' }
  if (['SUCCESS', 'REFUNDED', 'FAILED'].includes(execution.route_state)) {
    const onDestination = execution.data.refund
      ? execution.data.refund.chain === execution.dest_chain
      : !!execution.data.bridge?.dest
    return { status: execution.route_state === 'SUCCESS' || onDestination ? 'Failed' : 'NotExecuted' }
  }
  return { status: 'Pending' }
}

export const mapRouteStateToSwapStatus = (trackingExecution: TrackingExecution, hasGasDrop = false): SwapStatus => {
  const txHash = getFinalTxHash(trackingExecution, hasGasDrop)
  const amountOut = getFinalReceivedAmount(trackingExecution, hasGasDrop)
  const gasStatus = hasGasDrop ? { gasDropStatus: getGasDropStatus(trackingExecution) } : {}

  switch (trackingExecution.route_state) {
    case 'SUCCESS':
      return { ...gasStatus, txHash, status: 'Success', amountOut }
    case 'REFUNDED':
      return { ...gasStatus, txHash, status: 'Refunded' }
    case 'FAILED':
      return { ...gasStatus, txHash, status: 'Failed' }
    default:
      return { ...gasStatus, txHash, status: 'Processing' }
  }
}
