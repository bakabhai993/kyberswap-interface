import { ChainId } from '@kyberswap/ks-sdk-core'

import { NetworkLogo } from 'components/Logo'
import { TokenSelectorChain } from 'components/TokenSelectorModal/types'
import { type Chain, NonEvmChain } from 'types/crossChain'

// The chains whose logos stand for "All Networks"
const ALL_NETWORKS_SAMPLE: Chain[] = [ChainId.MAINNET, NonEvmChain.Bitcoin, ChainId.BSCMAINNET, ChainId.BASE]

export const NetworkIcon = ({ chainId }: { chainId: TokenSelectorChain }) =>
  chainId === 'all' ? (
    <span className="grid size-5 shrink-0 grid-cols-2 grid-rows-2 gap-px" aria-hidden="true">
      {ALL_NETWORKS_SAMPLE.map(chain => (
        <NetworkLogo key={chain} chainId={chain} className="size-full rounded-full" />
      ))}
    </span>
  ) : (
    <NetworkLogo chainId={chainId} className="size-5 shrink-0 rounded-full" />
  )
