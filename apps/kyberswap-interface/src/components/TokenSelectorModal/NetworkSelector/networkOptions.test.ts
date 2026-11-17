import { ChainId } from '@kyberswap/ks-sdk-core'
import { describe, expect, it, vi } from 'vitest'

import { NonEvmChain } from 'types/crossChain'

import { getSupportedDestinations, sortNetworks } from './networkOptions'

vi.mock('constants/env', () => ({ CROSSCHAIN_AGGREGATOR_API: 'https://aggregator.test' }))

const chains = [
  { name: 'bitcoin', chainId: null, providers: { from: ['nearintents'], to: ['nearintents', 'socket'] } },
  { name: 'optimism', chainId: ChainId.OPTIMISM, providers: { from: ['socket'], to: ['socket'] } },
  { name: 'ethereum', chainId: ChainId.MAINNET, providers: { from: ['nearintents'], to: ['nearintents'] } },
  { name: 'near', chainId: null, providers: { from: ['nearintents'], to: ['nearintents'] } },
]

describe('getSupportedDestinations', () => {
  it('uses source from and destination to providers, preserving directional coverage', () => {
    expect(getSupportedDestinations(chains, NonEvmChain.Bitcoin)).toEqual(
      new Set([NonEvmChain.Bitcoin, ChainId.MAINNET, NonEvmChain.Near]),
    )
    expect(getSupportedDestinations(chains, ChainId.OPTIMISM)).toEqual(new Set([ChainId.OPTIMISM, NonEvmChain.Bitcoin]))
  })

  it('retains same-chain swaps when the source is absent from bridge coverage', () => {
    expect(getSupportedDestinations(chains, ChainId.BASE)).toEqual(new Set([ChainId.BASE]))
  })

  it('does not map unknown non-EVM names to a selectable chain', () => {
    expect(
      getSupportedDestinations(
        [...chains, { name: 'unknown', chainId: null, providers: { from: [], to: ['nearintents'] } }],
        NonEvmChain.Bitcoin,
      ),
    ).not.toContain(undefined)
  })
})

const networks = [
  { chainId: NonEvmChain.Bitcoin, name: 'Bitcoin', icon: '', unavailableReason: 'No route' },
  { chainId: ChainId.BASE, name: 'Base', icon: '' },
  { chainId: NonEvmChain.Near, name: 'NEAR', icon: '', unavailableReason: 'No route' },
  { chainId: ChainId.MAINNET, name: 'Ethereum', icon: '' },
]

it('prioritizes pins in saved order even when dimmed, without changing the input list', () => {
  const original = [...networks]
  expect(sortNetworks(networks, ['1', 'bitcoin', '999999']).map(chain => chain.chainId)).toEqual([
    ChainId.MAINNET,
    NonEvmChain.Bitcoin,
    ChainId.BASE,
    NonEvmChain.Near,
  ])
  expect(networks).toEqual(original)
})

it('moves unpinned dimmed networks last and preserves order within both groups', () => {
  expect(sortNetworks(networks).map(chain => chain.chainId)).toEqual([
    ChainId.BASE,
    ChainId.MAINNET,
    NonEvmChain.Bitcoin,
    NonEvmChain.Near,
  ])
})

it('keeps the selected pair before pins and availability groups', () => {
  expect(sortNetworks(networks, ['1'], [NonEvmChain.Near, ChainId.BASE]).map(chain => chain.chainId)).toEqual([
    NonEvmChain.Near,
    ChainId.BASE,
    ChainId.MAINNET,
    NonEvmChain.Bitcoin,
  ])
})
