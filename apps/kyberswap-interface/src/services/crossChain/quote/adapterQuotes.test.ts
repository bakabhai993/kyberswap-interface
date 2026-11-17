import { ChainId, Token } from '@kyberswap/ks-sdk-core'
import { getClient } from '@relayprotocol/relay-sdk'
import type { QuoteParams } from 'services/crossChain/adapters'
import { KyberCrossAdapter } from 'services/crossChain/adapters/KyberCrossAdapter'
import * as kyberCrossExecution from 'services/crossChain/adapters/KyberCrossAdapter/service'
import { getKyberCrossRoutePlan } from 'services/crossChain/adapters/KyberCrossAdapter/utils'
import type { QuoteProvider } from 'services/crossChain/adapters/types'
import { CrossChainSwapFactory } from 'services/crossChain/factory'
import { getQuotes } from 'services/crossChain/quote/adapterQuotes'
import { getSourceFilters } from 'services/crossChain/quote/streamQuotes'
import { CrossChainSwapAdapterRegistry, type Quote } from 'services/crossChain/registry'
import type { WalletClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Currency } from 'types/crossChain'

vi.mock('@lifi/sdk', async importOriginal => ({
  ...(await importOriginal<typeof import('@lifi/sdk')>()),
  createConfig: vi.fn(),
}))

vi.mock('constants/env', async importOriginal => ({
  ...(await importOriginal<typeof import('constants/env')>()),
  CROSSCHAIN_AGGREGATOR_API: 'https://aggregator.test',
}))

const fromToken = { decimals: 18, symbol: 'ETH' } as Currency
const toToken = { decimals: 6, symbol: 'USDC' } as Currency
const baseParams: QuoteParams = {
  feeBps: 10,
  fromChain: 1,
  toChain: 137,
  fromToken,
  toToken,
  amount: '1000000000000000000',
  slippage: 50,
  tokenInUsd: 2_000,
  tokenOutUsd: 1,
  sender: '0x1111111111111111111111111111111111111111',
  recipient: '0x2222222222222222222222222222222222222222',
}

const encoder = new TextEncoder()

const createReader = (...reads: Array<ReadableStreamReadResult<Uint8Array> | Error>) => ({
  read: vi.fn(async () => {
    const next = reads.shift()
    if (next instanceof Error) throw next
    return next ?? { done: true, value: undefined }
  }),
  cancel: vi.fn(),
})

const createResponse = (reader: ReturnType<typeof createReader>, ok = true, status = 200) =>
  ({ ok, status, body: { getReader: () => reader } } as unknown as Response)

const createAdapter = (getQuote: QuoteProvider['getQuote'], name = 'KyberCross'): QuoteProvider => ({
  getName: () => name,
  getSupportedChains: () => [baseParams.fromChain, baseParams.toChain],
  getIcon: () => '',
  getQuote,
  executeSwap: vi.fn(),
  getTransactionStatus: vi.fn(),
  canSupport: () => true,
})

const setup = (params: QuoteParams = baseParams, adapterName = 'Symbiosis') => {
  const getQuote = vi.fn()
  const adapter = createAdapter(getQuote, adapterName)
  const registry = new CrossChainSwapAdapterRegistry()
  registry.registerAdapter(adapter)
  const onQuotes = vi.fn()
  const onQuoteReady = vi.fn()

  const run = (signal = new AbortController().signal) =>
    getQuotes({
      params,
      category: 'commonPair',
      currencyIn: fromToken,
      currencyOut: toToken,
      excludedSources: [],
      registry,
      signal,
      isReadOnly: false,
      onQuotes,
      onQuoteReady,
    })

  return { adapter, getQuote, onQuotes, onQuoteReady, run }
}

const quoteEvent = () =>
  `event: quote\ndata: ${JSON.stringify({
    provider: 'Symbiosis',
    outputAmount: 1000000,
    minOutputAmount: 990000,
    inputUsd: 2_000,
    outputUsd: 1,
    timeEstimate: 60,
    contractAddress: '0x3333333333333333333333333333333333333333',
    rawQuote: {},
  })}\n\n`

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('getQuotes', () => {
  it('keeps stream mode even when Gas Drop is requested', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createResponse(createReader({ done: false, value: encoder.encode(quoteEvent()) })),
    )
    const { getQuote, onQuotes, run } = setup({ ...baseParams, gasDrop: true })

    await run()

    expect(fetch).toHaveBeenCalledOnce()
    expect(getQuote).not.toHaveBeenCalled()
    expect(onQuotes).toHaveBeenCalledOnce()
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(url.searchParams.get('stream')).toBe('true')
    expect(url.searchParams.get('gasDrop')).toBe('true')
    expect(onQuotes.mock.calls[0][0][0].quote.gasDrop).toBeUndefined()
  })

  it('discards a pending stream quote when its request is cancelled', async () => {
    let resolveRead!: (value: ReadableStreamReadResult<Uint8Array>) => void
    let markReadStarted!: () => void
    const readStarted = new Promise<void>(resolve => {
      markReadStarted = resolve
    })
    const reader = createReader()
    reader.read.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRead = resolve
          markReadStarted()
        }),
    )
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(reader))
    const { onQuotes, run } = setup()
    const controller = new AbortController()
    const pending = run(controller.signal)
    await readStarted
    controller.abort()
    resolveRead({ done: false, value: encoder.encode(quoteEvent()) })

    await expect(pending).rejects.toThrow('Cancelled')
    expect(onQuotes).not.toHaveBeenCalled()
  })

  it('does not call a local adapter when the aggregator returns no quotes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(createReader()))
    const { getQuote, onQuotes, run } = setup()

    await expect(run()).rejects.toThrow('No valid quotes found for the requested swap')

    expect(getQuote).not.toHaveBeenCalled()
    expect(onQuotes).not.toHaveBeenCalled()
  })

  it.each([
    ['an HTTP failure', () => Promise.resolve(createResponse(createReader(), false, 503)), 'HTTP error! status: 503'],
    ['a network failure', () => Promise.reject(new Error('network unavailable')), 'network unavailable'],
  ])('does not call a local adapter after %s', async (_name, fetchResult, expectedError) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchResult)
    const { getQuote, run } = setup()

    await expect(run()).rejects.toThrow(expectedError)

    expect(getQuote).not.toHaveBeenCalled()
  })

  it('emits a valid streamed quote without calling the matching adapter getQuote', async () => {
    const reader = createReader({ done: false, value: encoder.encode(quoteEvent()) }, { done: true, value: undefined })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(reader))
    const { adapter, getQuote, onQuotes, run } = setup()

    await run()

    expect(onQuotes).toHaveBeenCalledWith([
      expect.objectContaining({
        adapter,
        isReadOnly: false,
        quote: expect.objectContaining({
          outputAmount: 1_000_000n,
          minimumOutputAmount: 990000n,
          quoteParams: baseParams,
        }),
      }),
    ])
    expect(getQuote).not.toHaveBeenCalled()
  })

  it('does not fall back locally when the stream fails after emitting a quote', async () => {
    const reader = createReader({ done: false, value: encoder.encode(quoteEvent()) }, new Error('stream interrupted'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(reader))
    const { getQuote, onQuotes, run } = setup()

    await expect(run()).rejects.toThrow('stream interrupted')

    expect(onQuotes).toHaveBeenCalledOnce()
    expect(getQuote).not.toHaveBeenCalled()
  })

  it('keeps using KyberSwap directly for a same-chain EVM quote', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse(createReader()))
    const params = { ...baseParams, toChain: baseParams.fromChain }
    const { adapter, getQuote, onQuotes, onQuoteReady, run } = setup(params, 'KyberSwap')
    const quote = { outputAmount: 1_000_000n }
    getQuote.mockResolvedValue(quote)

    await run()

    expect(fetch).not.toHaveBeenCalled()
    expect(getQuote).toHaveBeenCalledOnce()
    expect(getQuote).toHaveBeenCalledWith(params, expect.any(AbortSignal))
    expect(onQuotes).toHaveBeenCalledWith([{ adapter, quote, isReadOnly: false }])
    expect(onQuoteReady).toHaveBeenCalledOnce()
  })
})

describe('CrossChainSwapFactory', () => {
  it('registers KyberCross for execution without client quote acquisition', () => {
    const adapter = new KyberCrossAdapter()
    const registry = new CrossChainSwapAdapterRegistry()
    registry.registerAdapter(adapter)
    expect(registry.getAdapter('KyberCross')).toBe(adapter)
    expect(registry.getQuoteAdapter('KyberCross')).toBeUndefined()
  })

  it('resolves execution aliases without exposing them as direct quote adapters', () => {
    const socket = CrossChainSwapFactory.getAllAdapters().find(adapter => adapter.getName() === 'Socket')
    if (!socket) throw new Error('Socket adapter missing')
    const registry = new CrossChainSwapAdapterRegistry()
    registry.registerAdapter(socket)
    expect(registry.getAdapter('Bungee')).toBe(socket)
    expect(registry.getAdapter('Socket')).toBe(socket)
    expect(registry.getAllAdapters()).toEqual([socket])
    expect(registry.getQuoteAdapter('Bungee')).toBeUndefined()
  })

  it('resolves a direct quote provider through the same registry instance', () => {
    const adapter = createAdapter(vi.fn(), 'KyberSwap')
    const registry = new CrossChainSwapAdapterRegistry()
    registry.registerAdapter(adapter)
    expect(registry.getQuoteAdapter('KyberSwap')).toBe(adapter)
    expect(registry.getQuoteAdapter('missing')).toBeUndefined()
  })

  it('keeps Elysium registered for Relay execution with aggregator quotes', () => {
    expect(getClient().chains.some(chain => chain.id === ChainId.ELYSIUM)).toBe(true)
  })

  it('filters aggregator sources and excludes the same-chain adapter', () => {
    const stream = getSourceFilters(['KyberCross'], 'commonPair', fromToken, toToken)
    expect(stream.selectableSources.map(source => source.getName())).toContain('KyberCross')
    expect(stream.selectableSources.map(source => source.getName())).not.toContain('KyberSwap')
    expect(stream.selectableSources.map(source => source.getName())).not.toContain('CCIP')
    expect(stream.excludedSourceNames).toContain('KyberCross')
    expect(stream.excludedSourceNames).toContain('KyberSwap')
  })
})

describe('KyberCross route options', () => {
  const address = '0x1111111111111111111111111111111111111111'
  const params: QuoteParams = {
    ...baseParams,
    fromChain: ChainId.MAINNET,
    toChain: ChainId.BASE,
    fromToken: new Token(ChainId.MAINNET, address, 6, 'USDC'),
    toToken: new Token(ChainId.BASE, address, 6, 'USDC'),
    amount: '100000000',
    tokenInUsd: 1,
    tokenOutUsd: 1,
  }
  it.each([undefined, '2030-01-01T00:00:00Z'])(
    'executes a streamed KyberCross transaction with expiry %s without rebuilding',
    async expiresAt => {
      const buildTx = { to: address, data: '0x1234', value: '0' } as const
      const txHash = `0x${'1'.repeat(64)}` as const
      const execute = vi.spyOn(kyberCrossExecution, 'executeKyberCross').mockResolvedValue(txHash)
      const adapter = new KyberCrossAdapter()
      const registry = new CrossChainSwapAdapterRegistry()
      registry.registerAdapter(adapter)
      const event = `event: quote\ndata: ${JSON.stringify({
        provider: 'kybercross',
        outputAmount: '99000000',
        minOutputAmount: 98500000,
        inputUsd: 100,
        outputUsd: 99,
        timeEstimate: 30,
        contractAddress: address,
        quoteParams: { amount: params.amount, feeBps: 0, slippage: 50 },
        rawQuote: {
          data: {
            route_plan: { id: 'stream-route', expires_at: expiresAt, bridge: { provider: 'across' } },
            build: { tx: buildTx },
          },
        },
      })}\n\n`
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createResponse(createReader({ done: false, value: encoder.encode(event) })),
      )
      const onQuotes = vi.fn<[Quote[]], void>()
      await getQuotes({
        params,
        registry,
        category: 'stablePair',
        currencyIn: params.fromToken,
        currencyOut: params.toToken,
        excludedSources: [],
        signal: new AbortController().signal,
        isReadOnly: false,
        onQuotes,
        onQuoteReady: vi.fn(),
      })

      const quote = onQuotes.mock.calls[0][0][0]
      expect(getKyberCrossRoutePlan(quote.quote.rawQuote)).toMatchObject({
        id: 'stream-route',
        bridge: { provider: 'across' },
      })
      expect(quote.quote.minimumOutputAmount).toBe(98500000n)
      const result = await adapter.executeSwap(quote, {} as WalletClient)
      expect(result.kyberCrossRoute).toMatchObject({ id: 'stream-route', bridgeProvider: 'across' })
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ buildTx, inputAmount: BigInt(params.amount) }))
      expect(result).toMatchObject({ outputAmount: '99000000', sourceTxHash: txHash })
    },
  )
})
