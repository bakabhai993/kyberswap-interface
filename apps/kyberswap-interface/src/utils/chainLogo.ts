import { ChainId } from '@kyberswap/ks-sdk-core'
import { z } from 'zod'

import UnknownToken from 'assets/svg/kyber/unknown-token.svg'
import { NETWORKS_INFO } from 'constants/networks'
import { type Chain, type NonEvmChain, NonEvmChainInfo, isEvmChain } from 'types/crossChain'

/** Logo URL per EVM chain id, as configured in the ks-setting `chains` config. */
export type ChainLogoMap = { readonly [chainId: string]: string }

const EMPTY_CHAIN_LOGOS: ChainLogoMap = {}

const STORAGE_KEY = 'chainLogos'

const chainsConfigSchema = z.object({
  data: z.object({
    // Entries are checked one by one below, so a single malformed chain does not discard the rest
    config: z.array(z.unknown()),
  }),
})
// Logos are only taken from the ks-setting buckets the admin uploads to; an entry pointing anywhere
// else is skipped, so the app never loads a chain logo from a host Kyber does not control.
const logoUrlSchema = z.string().regex(/^https:\/\/storage\.googleapis\.com\/ks-setting-[0-9a-f]+\//)
const chainEntrySchema = z.object({
  chainId: z.union([z.string(), z.number()]),
  logoUrl: logoUrlSchema,
})
const chainLogoMapSchema = z.record(logoUrlSchema)

/**
 * Reads the logo of every chain out of a ks-setting `chains` response, skipping entries without a
 * usable one. Throws on a response that is not a chains config at all, so the request counts as
 * failed and the logos already in use stay.
 */
export const parseChainLogos = (response: unknown): ChainLogoMap => {
  const logos: { [chainId: string]: string } = {}
  chainsConfigSchema.parse(response).data.config.forEach(entry => {
    const chain = chainEntrySchema.safeParse(entry)
    if (chain.success) logos[String(chain.data.chainId)] = chain.data.logoUrl
  })
  return logos
}

let persistedLogos: ChainLogoMap | undefined

/**
 * The logos saved by the previous visit. They let a returning visitor paint the logos straight
 * away, before this visit's ks-setting response arrives.
 */
export const getPersistedChainLogos = (): ChainLogoMap => {
  if (persistedLogos) return persistedLogos
  persistedLogos = EMPTY_CHAIN_LOGOS
  try {
    const parsed = chainLogoMapSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'))
    if (parsed.success) persistedLogos = parsed.data
  } catch {
    // Storage can be unavailable (private mode, blocked site data) or hold a broken value
  }
  return persistedLogos
}

/**
 * Returns the saved map itself when `logos` holds the same entries. Consumers key their memos on
 * the map's identity, so a response that only confirms the saved logos must not look like a change.
 */
export const reusePersistedChainLogos = (logos: ChainLogoMap): ChainLogoMap => {
  const persisted = getPersistedChainLogos()
  const chainIds = Object.keys(logos)
  const isSame =
    chainIds.length === Object.keys(persisted).length &&
    chainIds.every(chainId => logos[chainId] === persisted[chainId])
  return isSame ? persisted : logos
}

export const persistChainLogos = (logos: ChainLogoMap) => {
  if (logos === persistedLogos) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logos))
  } catch {
    // Without storage the next visit simply waits for its own response
  }
}

/** Whether the app has an entry for the chain at all. */
export const isKnownChain = (chain: Chain): boolean =>
  !!(isEvmChain(chain) ? NETWORKS_INFO[chain as ChainId] : NonEvmChainInfo[chain as NonEvmChain])

/**
 * The logo of a chain, if it has one: the one configured in ks-setting for an EVM chain, or the
 * one a non-EVM chain carries itself (those are not part of the config).
 */
export const findChainLogo = (logos: ChainLogoMap, chain: Chain): string | undefined =>
  logos[chain] || NonEvmChainInfo[chain as NonEvmChain]?.icon

/** The image to render for a chain: its logo, or the unknown mark while it has none. */
export const resolveChainLogo = (logos: ChainLogoMap, chain: Chain): string =>
  findChainLogo(logos, chain) || UnknownToken
