import { ChainId } from '@kyberswap/ks-sdk-core'
import type { ChainName } from 'services/crossChain/adapters/KyberCrossAdapter/types'
import { type Chain as ViemChain } from 'viem'
import { arbitrum, base, bsc, hyperEvm, mainnet } from 'viem/chains'

import { elysium, robinhood } from 'components/Web3Provider/config'

// Keys are chain names sent to the KyberCross API; values are Viem chain configs used for execution.
// Execution and history lookups derive from the same configuration.
const kyberCrossChains: Record<ChainName, ViemChain & { id: ChainId }> = {
  ethereum: mainnet,
  arbitrum,
  base,
  bsc,
  robinhood,
  hyperevm: hyperEvm,
  elysium,
}

export const chainIdToViemChain: Record<number, ViemChain> = Object.fromEntries(
  Object.values(kyberCrossChains).map(chain => [chain.id, chain]),
)

export const chainIdToKyberCrossChainName: Partial<Record<ChainId, ChainName>> = Object.fromEntries(
  Object.entries(kyberCrossChains).map(([name, chain]) => [chain.id, name]),
)
