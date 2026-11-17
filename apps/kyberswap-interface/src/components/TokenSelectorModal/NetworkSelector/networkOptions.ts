import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { TokenSelectorChain, TokenSelectorNetwork } from 'components/TokenSelectorModal/types'
import { CROSSCHAIN_AGGREGATOR_API } from 'constants/env'
import { Chain, NonEvmChain } from 'types/crossChain'

type ChainEntry = {
  name: string
  chainId: number | null
  providers: { from: string[]; to: string[] }
}

type ChainsResponse = { code: number; data: { chains: ChainEntry[] } }

const getChainId = (entry: ChainEntry): Chain | undefined =>
  entry.chainId ?? Object.values(NonEvmChain).find(chain => chain === entry.name)

export const getSupportedDestinations = (chains: ChainEntry[], sourceChain: Chain): Set<Chain> => {
  const source = chains.find(chain => getChainId(chain) === sourceChain)
  // Same-chain swaps do not depend on bridge provider coverage.
  const destinations = new Set<Chain>([sourceChain])
  chains.forEach(chain => {
    const chainId = getChainId(chain)
    if (chainId !== undefined && source?.providers.from.some(provider => chain.providers.to.includes(provider))) {
      destinations.add(chainId)
    }
  })
  return destinations
}

/** Provider coverage is directional and shared by every output selector session. */
export const useCrossChainDestinations = (sourceChain?: Chain): Set<Chain> | undefined => {
  const { data } = useQuery({
    queryKey: ['cross-chain-chains'],
    enabled: sourceChain !== undefined,
    queryFn: async ({ signal }): Promise<ChainEntry[]> => {
      const response = await fetch(`${CROSSCHAIN_AGGREGATOR_API}/api/v1/chains`, { signal })
      if (!response.ok) throw new Error('Failed to fetch cross-chain networks')
      const result: ChainsResponse = await response.json()
      if (result.code !== 0 || !Array.isArray(result.data?.chains)) {
        throw new Error('Invalid cross-chain networks response')
      }
      return result.data.chains
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  })

  return useMemo(
    () => (data && sourceChain !== undefined ? getSupportedDestinations(data, sourceChain) : undefined),
    [data, sourceChain],
  )
}

/** Selected pair precedes saved pins, then unpinned networks ordered by availability. */
export const sortNetworks = (
  chains: TokenSelectorNetwork[],
  pinnedChains?: string[],
  priorityChainIds: TokenSelectorChain[] = [],
): TokenSelectorNetwork[] =>
  [...chains].sort((a, b) => {
    const aPriority = priorityChainIds.indexOf(a.chainId)
    const bPriority = priorityChainIds.indexOf(b.chainId)
    if (aPriority !== -1 || bPriority !== -1) {
      return (aPriority === -1 ? Infinity : aPriority) - (bPriority === -1 ? Infinity : bPriority)
    }

    const aIndex = pinnedChains?.indexOf(String(a.chainId)) ?? -1
    const bIndex = pinnedChains?.indexOf(String(b.chainId)) ?? -1

    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    }

    return Number(!!a.unavailableReason) - Number(!!b.unavailableReason)
  })
