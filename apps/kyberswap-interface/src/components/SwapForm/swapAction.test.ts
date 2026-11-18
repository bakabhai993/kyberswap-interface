import { i18n } from '@lingui/core'
import { beforeAll, expect, it } from 'vitest'

import { getCrossChainAction, getSingleChainAction } from './swapAction'

beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }))

const ready = {
  hasTokens: true,
  hasAmount: true,
  connected: true,
  wrongNetwork: false,
  selectTokenLabel: 'Select token',
  enterAmountLabel: 'Enter amount',
  wrapError: undefined,
  isWrap: false,
  noRoute: false,
  inputError: undefined,
  needsApproval: false,
  approving: false,
  findingRoute: false,
  checkingApproval: false,
  hasQuote: true,
  insufficientBalance: false,
  executable: true,
}

it.each([getSingleChainAction, getCrossChainAction])(
  'prioritizes form, connection and network before execution',
  resolve => {
    const input = {
      ...ready,
      hasTokens: false,
      hasAmount: false,
      connected: false,
      wrongNetwork: true,
      needsApproval: true,
    }
    expect(resolve(input)).toMatchObject({ type: 'blocked', label: 'Select token' })
    input.hasTokens = true
    expect(resolve({ ...input, pairError: 'Invalid pair' })).toMatchObject({ type: 'blocked', label: 'Invalid pair' })
    expect(resolve(input)).toMatchObject({ type: 'blocked', label: 'Enter amount' })
    input.hasAmount = true
    expect(resolve(input).type).toBe('connect')
    input.connected = true
    expect(resolve(input).type).toBe('switch-network')
    input.wrongNetwork = false
    expect(resolve(input).type).toBe('approve')
    input.needsApproval = false
    expect(resolve(input).type).toBe('review')
  },
)

it('keeps wrap ahead of swap-only route validation', () => {
  expect(getSingleChainAction({ ...ready, isWrap: true, noRoute: true }).type).toBe('wrap')
  expect(getSingleChainAction({ ...ready, isWrap: true, wrapError: 'Insufficient balance' })).toMatchObject({
    type: 'blocked',
    label: 'Insufficient balance',
  })
})

it('keeps recipient failures ahead of cross-chain quote loading and never reviews a stale quote', () => {
  expect(getCrossChainAction({ ...ready, recipientError: 'Invalid recipient', findingRoute: true })).toMatchObject({
    type: 'blocked',
    label: 'Invalid recipient',
  })
  expect(getCrossChainAction({ ...ready, executable: false, needsApproval: true })).toMatchObject({
    type: 'blocked',
    busy: true,
  })
})
