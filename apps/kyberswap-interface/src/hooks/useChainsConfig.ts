import { ChainId } from '@kyberswap/ks-sdk-core'
import { useMemo } from 'react'
import { useGetKyberswapGlobalConfigurationQuery } from 'services/ksSetting'

import { IS_TESTING_DEPLOYMENT } from 'constants/deployment'
import { MAINNET_NETWORKS, NETWORKS_INFO as NETWORKS_INFO_HARDCODE } from 'constants/networks'
import { NetworkInfo } from 'constants/networks/type'

export enum ChainState {
  NEW = 'new',
  PROVISIONAL = 'provisional',
  ACTIVE = 'active',
  MAINTENANCE = 'maintained',
  TESTING = 'testing',
}

// A chain under test is fully enabled on the team's deployments, so the product can be exercised on
// it exactly as it will behave once it is switched on in production, and stays invisible on the live
// site. A state this build does not recognise falls out of both lists, which is how `inactive` works.
const ENABLED_STATES: ChainState[] = [
  ChainState.ACTIVE,
  ChainState.NEW,
  ChainState.PROVISIONAL,
  ...(IS_TESTING_DEPLOYMENT ? [ChainState.TESTING] : []),
]
const SUPPORTED_STATES: ChainState[] = [...ENABLED_STATES, ChainState.MAINTENANCE]

export type ChainStateMap = {
  [chain in ChainId]: ChainState
}

const cacheInfo: { [chain: string]: NetworkInfo } = {}

export const NETWORKS_INFO = new Proxy(NETWORKS_INFO_HARDCODE, {
  get(target, p) {
    const prop = p as any as ChainId
    return cacheInfo[prop] || target[prop]
  },
})

const defaultData = MAINNET_NETWORKS.map(chainId => NETWORKS_INFO_HARDCODE[chainId])

export default function useChainsConfig() {
  // Chain states live in the ks-setting `kyberswap` config, so that request alone decides when the lists are final
  const { data, isError } = useGetKyberswapGlobalConfigurationQuery(undefined)
  const chainStates = data?.data?.config?.chainStates

  return useMemo(() => {
    const chains: NetworkInfo[] = defaultData.map(chain => {
      // Without the states (still loading, failed, or absent from the config) every hardcoded mainnet
      // counts as active; once they arrive, a chain they do not list falls out of both lists.
      const info = { ...chain, state: chainStates ? chainStates[chain.chainId] : ChainState.ACTIVE }
      cacheInfo[chain.chainId] = info
      return info
    })

    return {
      activeChains: chains.filter(chain => ENABLED_STATES.includes(chain.state)),
      supportedChains: chains.filter(chain => SUPPORTED_STATES.includes(chain.state)),
      allChains: chains,
      isLoaded: !!data || isError,
    }
  }, [data, chainStates, isError])
}
