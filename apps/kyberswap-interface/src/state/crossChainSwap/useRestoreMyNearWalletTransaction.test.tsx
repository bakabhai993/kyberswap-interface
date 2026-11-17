// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import {
  type PendingNearTransaction,
  getMyNearWalletPendingTransaction,
  removeMyNearWalletPendingTransaction,
  saveMyNearWalletPendingTransaction,
} from 'services/crossChain/adapters/NearIntentsAdapter/pendingTransaction'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useRestoreMyNearWalletTransaction } from './useRestoreMyNearWalletTransaction'

const dispatch = vi.fn()
vi.mock('state/hooks', () => ({ useAppDispatch: () => dispatch }))
vi.mock('state/crossChainSwap', () => ({
  addTransaction: (payload: unknown) => ({ type: 'local', payload }),
  enqueueTransactionSync: (payload: unknown) => ({ type: 'sync', payload }),
}))

const transferHash = '2'.repeat(44)
const storageHash = '3'.repeat(44)
const pending = {
  id: 'deposit.near',
  depositAddress: 'deposit.near',
  sender: 'alice.near',
  adapter: 'NearIntents',
} as PendingNearTransaction
let root: ReturnType<typeof createRoot>
let search: string
const Harness = () => {
  useRestoreMyNearWalletTransaction()
  search = useLocation().search
  return null
}
const render = (hashes: string) =>
  act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/swap?from=near&to=ethereum&transactionHashes=${hashes}`]}>
        <Harness />
      </MemoryRouter>,
    )
  })

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  dispatch.mockClear()
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root.unmount())
  removeMyNearWalletPendingTransaction()
  vi.unstubAllGlobals()
})

it.each([1, 2])('restores a transfer with %s wallet transaction(s) into local history', async count => {
  saveMyNearWalletPendingTransaction({ ...pending, expectedTransactions: count })
  await render(count === 1 ? transferHash : `${storageHash},${transferHash}`)

  expect(dispatch).toHaveBeenCalledTimes(1)
  expect(dispatch).toHaveBeenCalledWith({
    type: 'local',
    payload: { ...pending, sourceTxHash: transferHash },
  })
  expect(getMyNearWalletPendingTransaction()).toBeNull()
  expect(search).toBe('?from=near&to=ethereum')
})

it('does not record a storage registration as the completed FT transfer', async () => {
  saveMyNearWalletPendingTransaction({ ...pending, expectedTransactions: 2 })
  await render(storageHash)
  expect(dispatch).not.toHaveBeenCalled()
  expect(getMyNearWalletPendingTransaction()).not.toBeNull()
  expect(new URLSearchParams(search).get('transactionHashes')).toBe(storageHash)
})
