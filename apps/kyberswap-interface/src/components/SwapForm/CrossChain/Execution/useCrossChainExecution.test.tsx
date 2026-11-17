// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Quote } from 'services/crossChain/registry'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useCrossChainExecution } from 'components/SwapForm/CrossChain/Execution/useCrossChainExecution'
import type { NormalizedTxResponse } from 'types/crossChain'

const mocks = vi.hoisted(() => ({
  wallets: undefined as any,
  sendTransaction: vi.fn(),
  request: vi.fn(),
  execute: vi.fn(),
  enqueue: vi.fn(),
  dispatch: vi.fn(),
  track: vi.fn(),
  mixpanel: vi.fn(),
  entries: [] as { key: string }[],
  onSubmit: vi.fn(),
}))
vi.mock('components/SwapWallets/SwapWalletContext', () => ({ useSwapWallets: () => mocks.wallets }))
vi.mock('constants/networks', () => ({ NETWORKS_INFO: {}, SUPPORTED_NETWORKS: [] }))
vi.mock('@near-wallet-selector/react-hook', () => ({ useWalletSelector: () => ({}) }))
vi.mock('@solana/wallet-adapter-react', () => ({ useWallet: () => ({}), useConnection: () => ({ connection: {} }) }))
vi.mock('components/Web3Provider/BitcoinProvider', () => ({
  useBitcoinWallet: () => ({ walletInfo: {}, availableWallets: [] }),
}))
vi.mock('hooks/useGatedWalletClient', () => ({
  useGatedWalletClient: () => ({
    data: {
      account: { address: 'sender' },
      sendTransaction: mocks.sendTransaction,
      transport: { request: mocks.request },
    },
  }),
}))
vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams()] }))
vi.mock('services/blackjack', () => ({
  useLazyCheckBlackjackQuery: () => [async () => ({ data: { blacklisted: false } })],
}))
vi.mock('components/TipLinkGeneratorModal/shared', () => ({ getTipLinkAttribution: () => undefined }))
vi.mock('services/crossChain/adapters/RelayAdapter/relaySolanaWallet', () => ({ adaptRelaySolanaWallet: () => ({}) }))
vi.mock('services/crossChain/tracking', () => ({ getSwapTrackingData: () => ({}) }))
vi.mock('services/crossChain/utils', () => ({ getChainName: () => 'Ethereum', isQuoteExecutable: () => true }))
vi.mock('state/crossChainSwap', () => ({
  addTransaction: (payload: unknown) => ({ type: 'legacy', payload }),
  enqueueTransactionSync: (payload: unknown) => {
    mocks.enqueue(payload)
    return { type: 'enqueue', payload }
  },
  selectTransactionSync: () => mocks.entries[0],
}))
vi.mock('react-redux', () => ({ useStore: () => ({ getState: () => ({}) }) }))
vi.mock('state/hooks', () => ({ useAppDispatch: () => mocks.dispatch }))
vi.mock('hooks/useTracking', () => ({
  default: () => ({ trackingHandler: mocks.track }),
  useCrossChainMixpanel: () => ({ crossChainMixpanelHandler: mocks.mixpanel }),
  CROSS_CHAIN_MIXPANEL_TYPE: { CROSS_CHAIN_SWAP_INIT: 'init' },
  TRACKING_EVENT_TYPE: { CC_SWAP_INITIATED: 'init', CC_SWAP_FAILED: 'failed' },
}))
const makeQuote = (managed = true) =>
  ({
    adapter: { executeSwap: mocks.execute, getName: () => 'NearIntents' },
    isReadOnly: false,
    quote: {
      ...(managed ? { quoteId: 'reviewed-quote', quoteToken: 'reviewed-token' } : {}),
      quoteParams: {
        fromChain: 1,
        toChain: 8453,
        fromToken: { decimals: 6, symbol: 'IN' },
        toToken: { decimals: 6, symbol: 'OUT' },
        amount: '100',
        sender: 'sender',
        recipient: 'recipient',
      },
      outputAmount: 90n,
      inputUsd: 1,
      outputUsd: 1,
      platformFeePercent: 0,
    },
  } as unknown as Quote)
let root: ReturnType<typeof createRoot>
let execution: ReturnType<typeof useCrossChainExecution>
const Harness = ({ quote }: { quote: Quote | null }) => {
  execution = useCrossChainExecution(quote, { onSubmit: mocks.onSubmit })
  return null
}
const render = (quote: Quote | null) => act(async () => root.render(<Harness quote={quote} />))
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.resetAllMocks()
  mocks.entries = []
  mocks.wallets = { inputAddress: 'sender' }
  mocks.enqueue.mockImplementation(() => {
    const entry = { key: 'captured' }
    mocks.entries = [entry]
    return entry
  })
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

it('persists broadcast before confirmation, retaining reviewed identity even when review closes', async () => {
  let finish!: (result: NormalizedTxResponse) => void
  let broadcast!: (hash: string, tracking: { id: string; depositAddress?: string }) => void
  mocks.execute.mockImplementation((...args) => {
    broadcast = args[6]
    return new Promise(resolve => {
      finish = resolve
    })
  })
  await render(makeQuote())
  let submission!: Promise<void>
  await act(async () => {
    submission = execution.submitSwap()
  })
  expect(mocks.onSubmit).toHaveBeenCalledOnce()
  expect(mocks.onSubmit.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder[0])
  expect(mocks.enqueue).not.toHaveBeenCalled()
  await act(async () =>
    broadcast('real-source-hash', { id: 'provider-deposit-id', depositAddress: 'provider-deposit-id' }),
  )
  expect(mocks.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({
      quoteId: 'reviewed-quote',
      quoteToken: 'reviewed-token',
      sender: 'sender',
      transaction: expect.objectContaining({
        sourceTxHash: 'real-source-hash',
        id: 'provider-deposit-id',
        depositAddress: 'provider-deposit-id',
      }),
    }),
  )
  const captured = mocks.enqueue.mock.calls[0][0].transaction
  expect(execution.txHash).toBe('real-source-hash')
  expect(execution.submissionPhase).toBe('submitted')
  expect(execution.isSubmitting).toBe(false)
  expect(mocks.onSubmit).toHaveBeenCalledOnce()
  expect(mocks.track).toHaveBeenCalledOnce()
  await render(null)
  // BE can settle and remove the outbox before the old review's adapter returns.
  mocks.entries = []
  await act(async () => {
    finish(captured)
    await submission
  })
  expect(mocks.enqueue).toHaveBeenCalledOnce()
  expect(mocks.onSubmit).toHaveBeenCalledOnce()
  expect(execution.txHash).toBe('')
  expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'legacy' }))
})
it('does not call a broadcast swap failed when adapter confirmation times out', async () => {
  mocks.execute.mockImplementation(async (...args) => {
    args[6]('source', { id: 'provider' })
    throw new Error('confirmation timeout')
  })
  await render(makeQuote())
  await act(async () => execution.submitSwap())
  expect(mocks.enqueue).toHaveBeenCalledOnce()
  expect(execution.txHash).toBe('source')
  expect(execution.txError).toBe('')
  expect(mocks.track).toHaveBeenCalledWith('init', expect.anything())
  expect(mocks.track).not.toHaveBeenCalledWith('failed', expect.anything())
  expect(mocks.onSubmit).toHaveBeenCalledOnce()
})
it.each(['rejection', 'missing hash'])('invalidates before execution even when it ends with %s', async failure => {
  if (failure === 'rejection') mocks.execute.mockRejectedValueOnce(new Error('User rejected'))
  else mocks.execute.mockResolvedValueOnce({ sourceTxHash: '' })
  const quote = makeQuote()
  await render(quote)
  await act(async () => execution.submitSwap())
  expect(mocks.onSubmit).toHaveBeenCalledOnce()
  expect(mocks.onSubmit.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder[0])
  expect(mocks.enqueue).not.toHaveBeenCalled()
  expect(mocks.dispatch).not.toHaveBeenCalled()
  expect(execution.txError).toBe(failure === 'rejection' ? 'User rejected' : 'Source transaction hash is unavailable')

  await render(null)
  expect(mocks.onSubmit).toHaveBeenCalledOnce()
})

it('blocks duplicate submits while signing and does not invalidate again on late broadcast', async () => {
  let finish!: (result: NormalizedTxResponse) => void
  mocks.execute.mockImplementation(() => new Promise(resolve => (finish = resolve)))
  const quote = makeQuote()
  await render(quote)
  let submission!: Promise<void>
  await act(async () => {
    submission = execution.submitSwap()
    void execution.submitSwap()
  })
  const initialSubmit = mocks.onSubmit
  expect(initialSubmit).toHaveBeenCalledOnce()
  expect(execution.txHash).toBe('')
  mocks.onSubmit = vi.fn()
  await act(async () => execution.submitSwap())
  expect(mocks.execute).toHaveBeenCalledOnce()
  await render(null)
  await act(async () => {
    finish({ sourceTxHash: 'late-source' } as NormalizedTxResponse)
    await submission
  })
  expect(initialSubmit).toHaveBeenCalledOnce()
  expect(mocks.onSubmit).not.toHaveBeenCalled()
  expect(execution.txHash).toBe('')
  expect(mocks.enqueue).toHaveBeenCalledOnce()
})
it('does not borrow the global signer when the input wallet slot is unavailable', async () => {
  mocks.wallets = undefined
  await render(makeQuote())
  await act(async () => execution.submitSwap())
  expect(mocks.execute).not.toHaveBeenCalled()
  expect(mocks.enqueue).not.toHaveBeenCalled()
  expect(execution.submission.phase).toBe('error')
})

it('persists quotes without backend identity locally through broadcast and completion', async () => {
  mocks.execute.mockImplementation(async (...args) => {
    args[6]('source', { id: 'provider' })
    return { sourceTxHash: 'source', id: 'provider' }
  })
  await render(makeQuote(false))
  await act(async () => execution.submitSwap())
  expect(mocks.enqueue).not.toHaveBeenCalled()
  expect(mocks.dispatch).toHaveBeenCalledTimes(2)
})

it('executes and records the reviewed recipient instead of an adapter-returned address', async () => {
  const original = makeQuote()
  const quote = {
    ...original,
    quote: { ...original.quote, quoteParams: { ...original.quote.quoteParams, recipient: 'pasted-receiver' } },
  }
  mocks.execute.mockResolvedValue({
    sourceTxHash: 'broadcast-hash',
    sender: 'adapter-sender',
    recipient: 'adapter-recipient',
    sourceChain: 1,
    targetChain: 8453,
  })
  await render(quote)
  await act(async () => execution.submitSwap())
  expect(mocks.execute.mock.calls[0][0].quote.quoteParams.recipient).toBe('pasted-receiver')
  expect(mocks.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({
      sender: 'sender',
      transaction: expect.objectContaining({ sender: 'sender', recipient: 'pasted-receiver' }),
    }),
  )
  expect(mocks.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'legacy',
      payload: expect.objectContaining({ sender: 'sender', recipient: 'pasted-receiver' }),
    }),
  )
})

it.each(['near', 'solana', 'bitcoin'] as const)(
  'executes with the retained %s input session after reversal',
  async family => {
    const signer = {
      signAndSendTransactions: vi.fn(),
      publicKey: { toString: () => 'slot-sender' },
      sendTransaction: vi.fn(),
      request: vi.fn(),
      signTransaction: vi.fn(function (this: unknown) {
        return this
      }),
      sendBitcoin: vi.fn().mockResolvedValue('btc-hash'),
    }
    mocks.wallets = { inputAddress: 'slot-sender', inputConnection: { family, wallet: signer } }
    const quote = makeQuote()
    Object.assign(quote.quote.quoteParams, { fromChain: family, sender: 'slot-sender' })
    mocks.execute.mockImplementation(async (...args) => {
      if (family === 'near') {
        await args[2].wallet.signAndSendTransactions({ transactions: [] })
        expect(signer.signAndSendTransactions).toHaveBeenCalledOnce()
        expect(args[2].signedAccountId).toBe('slot-sender')
      } else if (family === 'solana') {
        expect(await args[1].signTransaction()).toBe(signer)
      } else {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ fastestFee: 2 }) }))
        await args[3]({ recipient: 'recipient', amount: '100' })
        expect(signer.sendBitcoin).toHaveBeenCalledWith(
          expect.objectContaining({ sender: 'slot-sender', amount: '100' }),
        )
      }
      return { sourceTxHash: 'source-hash', sender: 'wrong-provider-sender', sourceChain: family }
    })
    await render(quote)
    await act(async () => execution.submitSwap())
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: 'slot-sender',
        transaction: expect.objectContaining({ sender: 'slot-sender' }),
      }),
    )
  },
)
it('blocks execution when the input slot is empty even if a global wallet remains connected', async () => {
  mocks.wallets = { inputAddress: '', inputConnection: undefined }
  const quote = makeQuote()
  await render(quote)
  await act(async () => execution.submitSwap())
  expect(mocks.execute).not.toHaveBeenCalled()
  expect(execution.txError).toBeTruthy()
  expect(mocks.onSubmit).toHaveBeenCalledOnce()
})

it.each(['broadcast', 'rejection'])('isolates a late %s from a newer pending submission', async outcome => {
  let finishOld!: (result: NormalizedTxResponse) => void
  let rejectOld!: (error: Error) => void
  let finishNew!: (result: NormalizedTxResponse) => void
  mocks.execute
    .mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finishOld = resolve
          rejectOld = reject
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishNew = resolve
        }),
    )
  const oldQuote = makeQuote()
  await render(oldQuote)
  let oldSubmission!: Promise<void>
  await act(async () => {
    oldSubmission = execution.submitSwap()
  })
  await render(null)
  const nextQuote = { ...oldQuote, quote: { ...oldQuote.quote, quoteId: 'next-quote' } }
  await render(nextQuote)
  let nextSubmission!: Promise<void>
  await act(async () => {
    nextSubmission = execution.submitSwap()
  })
  await act(async () => {
    if (outcome === 'broadcast') finishOld({ sourceTxHash: 'old-hash' } as NormalizedTxResponse)
    else rejectOld(new Error('User rejected old submission'))
    await oldSubmission
  })
  if (outcome === 'broadcast') {
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: 'reviewed-quote',
        transaction: expect.objectContaining({ sourceTxHash: 'old-hash' }),
      }),
    )
  } else expect(mocks.enqueue).not.toHaveBeenCalled()
  expect(mocks.onSubmit).toHaveBeenCalledTimes(2)
  expect(execution.isSubmitting).toBe(true)
  expect(execution.txHash).toBe('')
  expect(execution.txError).toBe('')
  await act(async () => {
    finishNew({ sourceTxHash: 'new-hash' } as NormalizedTxResponse)
    await nextSubmission
  })
  expect(execution.txHash).toBe('new-hash')
  expect(execution.isSubmitting).toBe(false)
  expect(execution.txError).toBe('')
  expect(mocks.onSubmit).toHaveBeenCalledTimes(2)
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

it('reports actual wallet prompts and never treats an approval hash as a submitted swap', async () => {
  const prepared = deferred<void>()
  const approval = deferred<string>()
  const approvalConfirmed = deferred<void>()
  const swap = deferred<string>()
  const confirmation = deferred<NormalizedTxResponse>()
  mocks.sendTransaction.mockReturnValueOnce(approval.promise).mockReturnValueOnce(swap.promise)
  mocks.execute.mockImplementation(async (...args) => {
    await prepared.promise
    await args[1].sendTransaction({ data: 'approval' })
    await approvalConfirmed.promise
    const hash = await args[1].sendTransaction({ data: 'swap' })
    args[6](hash)
    return confirmation.promise
  })
  await render(makeQuote())
  let submitted!: Promise<void>
  await act(async () => {
    submitted = execution.submitSwap()
  })
  expect(execution.submissionPhase).toBe('preparing')
  expect(mocks.sendTransaction).not.toHaveBeenCalled()
  await act(async () => prepared.resolve())
  expect(execution.submissionPhase).toBe('signing')
  await act(async () => approval.resolve('approval-hash'))
  expect(execution.submissionPhase).toBe('preparing')
  expect(execution.txHash).toBe('')
  expect(mocks.enqueue).not.toHaveBeenCalled()
  await act(async () => approvalConfirmed.resolve())
  expect(execution.submissionPhase).toBe('signing')
  await act(async () => swap.resolve('swap-hash'))
  expect(execution.submissionPhase).toBe('submitted')
  expect(execution.txHash).toBe('swap-hash')
  await act(async () => execution.submitSwap())
  expect(mocks.execute).toHaveBeenCalledOnce()
  await act(async () => {
    confirmation.reject(new Error('confirmation timeout'))
    await submitted
  })
  expect(execution.submissionPhase).toBe('submitted')
  expect(execution.txError).toBe('')
})

it('keeps a reopened review detached from late wallet and broadcast callbacks', async () => {
  const signed = deferred<string>()
  mocks.sendTransaction.mockReturnValue(signed.promise)
  mocks.execute.mockImplementation(async (...args) => {
    const hash = await args[1].sendTransaction({})
    args[6](hash)
    return { sourceTxHash: hash }
  })
  await render(makeQuote())
  let submitted!: Promise<void>
  await act(async () => {
    submitted = execution.submitSwap()
  })
  expect(execution.submissionPhase).toBe('signing')
  await render(null)
  await render(makeQuote())
  expect(execution.submissionPhase).toBe('idle')
  await act(async () => {
    signed.resolve('late-hash')
    await submitted
  })
  expect(execution.submissionPhase).toBe('idle')
  expect(execution.txHash).toBe('')
  expect(mocks.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({ transaction: expect.objectContaining({ sourceTxHash: 'late-hash' }) }),
  )
})

it('reports a wallet rejection before broadcast as an error', async () => {
  mocks.sendTransaction.mockRejectedValue(new Error('User rejected'))
  mocks.execute.mockImplementation(async (...args) => args[1].sendTransaction({}))
  await render(makeQuote())
  await act(async () => execution.submitSwap())
  expect(execution.submissionPhase).toBe('error')
  expect(execution.isSubmitting).toBe(false)
  expect(execution.txHash).toBe('')
  expect(execution.txError).toBe('User rejected')
})

it('observes SDK transport signing without showing confirmation during read-only RPC calls', async () => {
  const read = deferred<string>()
  const signed = deferred<string>()
  mocks.request.mockReturnValueOnce(read.promise).mockReturnValueOnce(signed.promise)
  mocks.execute.mockImplementation(async (...args) => {
    await args[1].transport.request({ method: 'eth_chainId' })
    const hash = await args[1].transport.request({ method: 'eth_sendTransaction', params: [{}] })
    return { sourceTxHash: hash }
  })
  await render(makeQuote())
  let submitted!: Promise<void>
  await act(async () => {
    submitted = execution.submitSwap()
  })
  expect(execution.submissionPhase).toBe('preparing')
  await act(async () => read.resolve('0x1'))
  expect(execution.submissionPhase).toBe('signing')
  await act(async () => {
    signed.resolve('sdk-hash')
    await submitted
  })
  expect(execution.submissionPhase).toBe('submitted')
  expect(execution.txHash).toBe('sdk-hash')
})
