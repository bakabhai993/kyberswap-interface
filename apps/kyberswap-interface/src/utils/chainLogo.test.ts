import { ChainId } from '@kyberswap/ks-sdk-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import UnknownToken from 'assets/svg/kyber/unknown-token.svg'
import { NonEvmChain, NonEvmChainInfo } from 'types/crossChain'
import { findChainLogo, isKnownChain, parseChainLogos, resolveChainLogo } from 'utils/chainLogo'

const ARBITRUM_LOGO = 'https://storage.googleapis.com/ks-setting-1d682dca/arbitrum.svg'
const BASE_LOGO = 'https://storage.googleapis.com/ks-setting-1d682dca/base.svg'

const chainsResponse = (config: unknown) => ({ code: 0, message: 'Succeeded', data: { hash: 'abc', config } })

describe('parseChainLogos', () => {
  it('maps every chain to its logo', () => {
    const logos = parseChainLogos(
      chainsResponse([
        { chainId: '42161', chainName: 'arbitrum', displayName: 'Arbitrum', logoUrl: ARBITRUM_LOGO },
        { chainId: 8453, chainName: 'base', displayName: 'Base', logoUrl: BASE_LOGO },
      ]),
    )

    expect(logos).toEqual({ '42161': ARBITRUM_LOGO, '8453': BASE_LOGO })
  })

  it('skips the entries without a usable logo and keeps the rest', () => {
    const logos = parseChainLogos(
      chainsResponse([
        { chainId: '1', logoUrl: '' },
        { chainId: '10', logoUrl: 'http://insecure.example/optimism.png' },
        { chainId: '56', logoUrl: 'javascript:alert(1)' },
        // Only the ks-setting buckets are trusted, not any https host
        { chainId: '146', logoUrl: 'https://www.soniclabs.com/apple-icon.png' },
        { chainId: '250', logoUrl: 'https://storage.googleapis.com/another-bucket/fantom.svg' },
        { chainId: '137' },
        { logoUrl: BASE_LOGO },
        null,
        'not a chain',
        { chainId: '42161', logoUrl: ARBITRUM_LOGO },
      ]),
    )

    expect(logos).toEqual({ '42161': ARBITRUM_LOGO })
  })

  it.each([undefined, null, 'error', {}, { data: {} }, { data: { config: {} } }, { data: { config: 'none' } }])(
    'rejects the malformed response %j',
    response => {
      expect(() => parseChainLogos(response)).toThrow()
    },
  )
})

describe('findChainLogo', () => {
  it('returns the configured logo', () => {
    expect(findChainLogo({ [ChainId.ARBITRUM]: ARBITRUM_LOGO }, ChainId.ARBITRUM)).toBe(ARBITRUM_LOGO)
  })

  it('returns nothing for a chain the config has no logo for', () => {
    expect(findChainLogo({ [ChainId.ARBITRUM]: ARBITRUM_LOGO }, ChainId.BASE)).toBeUndefined()
    expect(findChainLogo({}, ChainId.MAINNET)).toBeUndefined()
  })

  it('serves non-EVM chains from the logo they carry themselves', () => {
    expect(findChainLogo({}, NonEvmChain.Solana)).toBe(NonEvmChainInfo[NonEvmChain.Solana].icon)
  })
})

describe('resolveChainLogo', () => {
  it('prefers the configured logo', () => {
    expect(resolveChainLogo({ [ChainId.ARBITRUM]: ARBITRUM_LOGO }, ChainId.ARBITRUM)).toBe(ARBITRUM_LOGO)
  })

  it('falls back to the unknown mark while the chain has no logo', () => {
    expect(resolveChainLogo({ [ChainId.ARBITRUM]: ARBITRUM_LOGO }, ChainId.BASE)).toBe(UnknownToken)
    expect(resolveChainLogo({}, undefined as unknown as ChainId)).toBe(UnknownToken)
  })
})

describe('isKnownChain', () => {
  it('knows the chains the app has an entry for', () => {
    expect(isKnownChain(ChainId.MAINNET)).toBe(true)
    expect(isKnownChain(NonEvmChain.Bitcoin)).toBe(true)
  })

  it('does not know any other value', () => {
    expect(isKnownChain(999_999_999 as ChainId)).toBe(false)
    expect(isKnownChain(undefined as unknown as ChainId)).toBe(false)
  })
})

describe('persisted chain logos', () => {
  const STORAGE_KEY = 'chainLogos'

  // Other modules read their own keys from storage while this one loads; they get nothing
  const storageHolding = (value: string | null) => ({
    getItem: vi.fn((key: string) => (key === STORAGE_KEY ? value : null)),
    setItem: vi.fn(),
  })

  // The saved logos are read once per page load, so each case loads a fresh copy of the module.
  const loadWithStorage = async (storage: ReturnType<typeof storageHolding> | undefined) => {
    vi.resetModules()
    vi.stubGlobal('localStorage', storage)
    return import('utils/chainLogo')
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads back what the previous visit saved', async () => {
    const storage = storageHolding(JSON.stringify({ '42161': ARBITRUM_LOGO }))
    const { getPersistedChainLogos } = await loadWithStorage(storage)

    expect(getPersistedChainLogos()).toEqual({ '42161': ARBITRUM_LOGO })
    // A second read is served from memory, so the map keeps one identity for the whole visit
    expect(getPersistedChainLogos()).toBe(getPersistedChainLogos())
    expect(storage.getItem.mock.calls.filter(([key]) => key === STORAGE_KEY)).toHaveLength(1)
  })

  it.each([
    null,
    '',
    'not json',
    '[]',
    '"text"',
    JSON.stringify({ '1': 'http://insecure.example/eth.png' }),
    JSON.stringify({ '146': 'https://www.soniclabs.com/apple-icon.png' }),
  ])('ignores the unusable saved value %j', async value => {
    const { getPersistedChainLogos } = await loadWithStorage(storageHolding(value))

    expect(getPersistedChainLogos()).toEqual({})
  })

  it('hands back the saved map when a response holds the same logos', async () => {
    const saved = { '42161': ARBITRUM_LOGO, '8453': BASE_LOGO }
    const { getPersistedChainLogos, reusePersistedChainLogos } = await loadWithStorage(
      storageHolding(JSON.stringify(saved)),
    )

    expect(reusePersistedChainLogos({ '8453': BASE_LOGO, '42161': ARBITRUM_LOGO })).toBe(getPersistedChainLogos())
  })

  it.each([
    ['a changed logo', { '42161': ARBITRUM_LOGO, '8453': ARBITRUM_LOGO }],
    ['a removed chain', { '42161': ARBITRUM_LOGO }],
    ['an added chain', { '42161': ARBITRUM_LOGO, '8453': BASE_LOGO, '1': BASE_LOGO }],
  ])('keeps the response when it has %s', async (_case, response) => {
    const { reusePersistedChainLogos } = await loadWithStorage(
      storageHolding(JSON.stringify({ '42161': ARBITRUM_LOGO, '8453': BASE_LOGO })),
    )

    expect(reusePersistedChainLogos(response)).toBe(response)
  })

  it('does not rewrite storage with the map it was read from', async () => {
    const storage = storageHolding(JSON.stringify({ '42161': ARBITRUM_LOGO }))
    const { getPersistedChainLogos, persistChainLogos } = await loadWithStorage(storage)

    persistChainLogos(getPersistedChainLogos())

    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('works without storage', async () => {
    const { getPersistedChainLogos, persistChainLogos } = await loadWithStorage(undefined)

    expect(getPersistedChainLogos()).toEqual({})
    expect(() => persistChainLogos({ '42161': ARBITRUM_LOGO })).not.toThrow()
  })

  it('saves the logos for the next visit', async () => {
    const storage = storageHolding(null)
    const { persistChainLogos } = await loadWithStorage(storage)

    persistChainLogos({ '42161': ARBITRUM_LOGO })

    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify({ '42161': ARBITRUM_LOGO }))
  })
})
