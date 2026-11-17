// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useRecipientTracking } from './useRecipientTracking'

const track = vi.hoisted(() => vi.fn())
vi.mock('hooks/useTracking', () => ({
  default: () => ({ trackingHandler: track }),
  TRACKING_EVENT_TYPE: { SWAP_RECIPIENT_APPLIED: 'applied', SWAP_RECIPIENT_OPENED: 'opened' },
}))
let root: ReturnType<typeof createRoot>
let tracking: ReturnType<typeof useRecipientTracking>
const Harness = ({ draft, address, loading }: { draft: string; address?: string; loading: boolean }) => {
  tracking = useRecipientTracking(draft, address, loading, 8453, 'cross-chain')
  return null
}
const render = (draft: string, address?: string, loading = false) =>
  act(async () => root.render(<Harness draft={draft} address={address} loading={loading} />))
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  track.mockClear()
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})
it('ignores wallet hydration and tracks only a validated user change once', async () => {
  await render('', 'wallet')
  expect(track).not.toHaveBeenCalled()
  tracking.changed('alice.eth')
  await render('alice.eth', undefined, true)
  expect(track).not.toHaveBeenCalled()
  await render('alice.eth', '0xresolved')
  await render('alice.eth', '0xresolved')
  expect(track.mock.calls).toEqual([
    ['applied', { to_chain_id: 8453, recipient_address: '0xresolved', mode: 'cross-chain' }],
  ])
})
it('does not report a stale validation result after the user clears the input', async () => {
  await render('')
  tracking.changed('alice.eth')
  await render('alice.eth', undefined, true)
  tracking.changed('')
  await render('', '0xresolved')
  expect(track).not.toHaveBeenCalled()
})
