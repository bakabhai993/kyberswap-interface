// @vitest-environment happy-dom
import { CurrencyAmount, Token } from '@kyberswap/ks-sdk-core'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ApprovalState, ApprovalStatus, useApproveCallback } from './useApproveCallback'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  send: vi.fn(),
  add: vi.fn(),
  notify: vi.fn(),
  pending: false,
  account: '0x0000000000000000000000000000000000000001',
}))
vi.mock('@wagmi/core', () => ({ readContract: (...args: unknown[]) => mocks.read(...args) }))
vi.mock('components/Web3Provider', () => ({ wagmiConfig: {} }))
vi.mock('hooks', () => ({
  useActiveWeb3React: () => ({ account: mocks.account, chainId: 1 }),
  useWeb3React: () => ({ isSmartConnector: false }),
}))
vi.mock('state/application/hooks', () => ({ useNotify: () => mocks.notify }))
vi.mock('state/transactions/hooks', () => ({
  useHasPendingApproval: () => mocks.pending,
  useTransactionAdder: () => mocks.add,
}))
vi.mock('utils/sendTransaction', () => ({ sendEVMTransaction: (...args: unknown[]) => mocks.send(...args) }))
vi.mock('utils/errorMessage', () => ({ friendlyError: () => 'error' }))
vi.mock('utils/walletError', () => ({ didUserReject: (error: any) => error?.code === 4001 }))
vi.mock('utils/viem', () => ({
  maxUint256: 2n ** 256n - 1n,
  encodeFunctionData: ({ args }: any) => args[1].toString(),
}))

const token = new Token(1, '0x0000000000000000000000000000000000000002', 18, 'TEST')
const amount = CurrencyAmount.fromRawAmount(token, '100')
const spender = '0x0000000000000000000000000000000000000003'
let result: ReturnType<typeof useApproveCallback>
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
function Harness({ target = spender }: { target?: string }) {
  result = useApproveCallback({ amount, spender: target })
  return null
}
const render = (target = spender) =>
  act(async () => {
    root.render(<Harness target={target} />)
  })

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  mocks.pending = false
  mocks.account = '0x0000000000000000000000000000000000000001'
  mocks.read.mockResolvedValue(0n)
  mocks.send.mockResolvedValue({ hash: '0x123' })
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(() => act(() => root.unmount()))

it.each([
  ['exact', '100'],
  ['infinite', (2n ** 256n - 1n).toString()],
])('submits %s allowance', async (mode, expected) => {
  await render()
  await act(async () => {
    expect(await result[1](mode === 'exact' ? amount : undefined)).toBe(ApprovalStatus.SUBMITTED)
  })
  expect(mocks.send.mock.calls[0][0].encodedData).toBe(expected)
})

it('hides the previous account allowance immediately and ignores its late response', async () => {
  let resolveOld!: (value: bigint) => void
  mocks.read.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        resolveOld = resolve
      }),
  )
  await render()
  mocks.account = '0x0000000000000000000000000000000000000004'
  await render()
  expect(result[0]).toBe(ApprovalState.NOT_APPROVED)
  await act(async () => resolveOld(1000n))
  expect(result[0]).toBe(ApprovalState.NOT_APPROVED)
})

it('does not reuse an approved allowance while a new spender is loading', async () => {
  mocks.read.mockResolvedValueOnce(1000n)
  await render()
  expect(result[0]).toBe(ApprovalState.APPROVED)
  mocks.read.mockImplementationOnce(() => new Promise(() => {}))
  await render('0x0000000000000000000000000000000000000004')
  expect(result[0]).toBe(ApprovalState.UNKNOWN)
  expect(result[2]).toBeUndefined()
})

it('tracks a zero reset as pending and refreshes allowance after confirmation', async () => {
  mocks.read.mockResolvedValue(50n)
  mocks.send.mockRejectedValueOnce(new Error('reset required'))
  await render()
  await act(async () => {
    expect(await result[1](amount)).toBe(ApprovalStatus.FAILED)
  })
  expect(mocks.send.mock.calls.map(([request]) => request.encodedData)).toEqual(['100', '0'])
  expect(mocks.add).toHaveBeenCalledWith(
    expect.objectContaining({ extraInfo: expect.objectContaining({ approvalReset: true }) }),
  )
  mocks.pending = true
  await render()
  expect(result[0]).toBe(ApprovalState.PENDING)
  mocks.read.mockResolvedValue(0n)
  mocks.pending = false
  await render()
  expect(result[0]).toBe(ApprovalState.NOT_APPROVED)
  expect(result[2]?.quotient.toString()).toBe('0')
})

it('stops on wallet rejection without fallback transactions', async () => {
  mocks.send.mockRejectedValueOnce({ code: 4001 })
  await render()
  await act(async () => {
    expect(await result[1]()).toBe(ApprovalStatus.REJECTED)
  })
  expect(mocks.send).toHaveBeenCalledTimes(1)
  expect(mocks.add).not.toHaveBeenCalled()
})

it.each([false, true])('waits for transaction registration before finishing approval (reset=%s)', async reset => {
  let register!: () => void
  const registration = new Promise<void>(resolve => {
    register = resolve
  })
  mocks.add.mockImplementationOnce(() => registration)
  if (reset) mocks.send.mockRejectedValueOnce(new Error('reset required'))
  await render()

  let settled = false
  const approval = result[1](amount).then(status => {
    settled = true
    return status
  })
  await act(async () => {
    await Promise.resolve()
  })
  expect(mocks.add).toHaveBeenCalledTimes(1)
  expect(settled).toBe(false)

  await act(async () => {
    mocks.pending = true
    register()
    expect(await approval).toBe(reset ? ApprovalStatus.FAILED : ApprovalStatus.SUBMITTED)
  })
  await render()
  expect(result[0]).toBe(ApprovalState.PENDING)
})
