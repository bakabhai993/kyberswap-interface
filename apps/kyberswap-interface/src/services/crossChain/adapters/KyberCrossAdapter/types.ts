import type { Address, Hash, Hex } from 'viem'

type UIntString = string
type TokenReference = string
type JsonObject = Record<string, unknown>

export type ChainName = 'ethereum' | 'arbitrum' | 'base' | 'bsc' | 'robinhood' | 'hyperevm' | 'elysium'
export type BridgeProvider =
  | 'across'
  | 'relay'
  | 'mayan'
  | 'near_intents'
  | 'cctp_v2'
  | 'cctp_v2_fast'
  | 'ccip'
  | 'eco'
  | 'arbitrum_bridge'
type FlowType = 'bridge_only' | 'swap_then_bridge' | 'bridge_then_swap' | 'swap_bridge_swap'
export type RouteState =
  | 'BRIDGE_PENDING'
  | 'BRIDGE_CLAIM_PENDING'
  | 'DST_ACTION_PENDING'
  | 'BRIDGE_EXPIRED'
  | 'BRIDGE_FAILED'
  | 'DST_RECEIVED'
  | 'GAS_DROP_PENDING'
  | 'SWAP_PENDING'
  | 'SWAP_EXPIRED'
  | 'SWAP_UNEXECUTABLE'
  | 'SWAP_REFUND_PENDING'
  | 'SUCCESS'
  | 'REFUNDED'
  | 'FAILED'
export type FundState = 'IN_BRIDGE' | 'IN_DST_ESCROW' | 'SETTLED_OUT' | 'SETTLED_REFUND' | 'UNRECOVERED'

type FeePlan = {
  type: 'partner_fee' | 'protocol_fee'
  chain: ChainName
  token: TokenReference
  recipient: Address
  rate_bps: number
  charged_on: 'bridge_input' | 'bridge_output'
  expected_amount?: UIntString
  min_amount?: UIntString
}

export type SwapPlan = {
  token_in: TokenReference
  token_out: TokenReference
  input_amount: UIntString
  expected_output_amount: UIntString
  min_output_amount: UIntString
  metadata?: {
    route_id: string
    route_summary: JsonObject
  }
}

type SwapData = {
  token_in: Address
  token_out: Address
  input_amount?: UIntString
  output_amount: UIntString
}

type OnChainBridgeData = {
  tx_hash: Hash
  token: Address
  amount: UIntString
}

type CCTPClaimData = {
  nonce: string
  message: string
  attestation: string
}

type BridgeData = {
  source: OnChainBridgeData
  dest?: OnChainBridgeData
  cctp?: CCTPClaimData
}

type WithdrawData = {
  token: Address
  withdraw_amount: UIntString
  to_address: Address
}

type RouteExecutionData = {
  source_swap?: SwapData
  bridge?: BridgeData
  dest_swap?: SwapData
  gas_drop?: SwapData
  withdraw?: WithdrawData
  refund?: { chain: ChainName; token: Address; amount: UIntString }
  dest_withdraw?: WithdrawData
  fees?: {
    fee_type: 'partner_fee' | 'protocol_fee'
    chain: ChainName
    token: Address
    amount: UIntString
    recipient: Address
  }[]
}

export type TrackingExecution = {
  slippage_bps?: number
  route_plan_id: string
  from_address: Address
  to_address: Address
  source_chain: ChainName
  dest_chain: ChainName
  flow_type: FlowType
  source_tx_hash: Hash
  token_in: Address
  token_out: Address
  bridge_provider: BridgeProvider
  route_state: RouteState
  fund_state?: FundState
  data: RouteExecutionData
  dest_tx_hash?: Hash | null
}

export type TrackingExecutionResponseData = {
  route_execution: TrackingExecution
}

export type ExecutionTx = {
  to: Address
  data: Hex
  value: UIntString
  gas?: UIntString
}

export type BuildResult = {
  tx: ExecutionTx
  expires_at?: string
}

// The aggregator supplies display metadata and an already-built transaction.
export type GasDropPlan = SwapPlan

export type KyberCrossStreamQuoteData = {
  route_plan: {
    id: string
    tags?: string[]
    estimated_duration_sec?: number
    flow_type?: FlowType
    source_swap?: SwapPlan
    dest_swap?: SwapPlan
    gas_drop_swap?: GasDropPlan
    fees?: FeePlan[]
    expires_at?: string
    bridge: { provider: BridgeProvider; metadata?: Record<string, unknown> }
  }
  build: BuildResult
}

export type KyberCrossRawQuote = {
  request_id?: string
  data?: KyberCrossStreamQuoteData
  isNativeToken?: boolean
}
