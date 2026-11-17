import { Token } from '@kyberswap/ks-sdk-core'
import { expect, it } from 'vitest'

import { computeInventoryDiscoveries } from './discoveries'
import { WalletInventory, buildInventoryBalanceMap } from './resolve'

it('retains fetched discoveries and balances while omitted partial balances stay unknown', () => {
  const held = new Token(1, '0x0000000000000000000000000000000000000001', 18, 'HELD')
  const zero = new Token(1, '0x0000000000000000000000000000000000000002', 18, 'ZERO')
  const missing = new Token(1, '0x0000000000000000000000000000000000000003', 18, 'MISSING')
  const inventory: WalletInventory = {
    active: true,
    complete: false,
    rows: {
      [held.address]: { address: held.address, rawBalance: 10n, blockNumber: 1, decimals: 18, symbol: 'HELD' },
      [zero.address]: { address: zero.address, rawBalance: 0n, blockNumber: 2, decimals: 18, symbol: 'ZERO' },
    },
  }
  const tokens = [held, zero, missing]
  const balances = buildInventoryBalanceMap(tokens, inventory)
  expect(balances[held.address]?.quotient.toString()).toBe('10')
  expect(balances[zero.address]?.quotient.toString()).toBe('0')
  expect(balances).not.toHaveProperty(missing.address)
  expect(computeInventoryDiscoveries(inventory, {}, [], 1).tokens.map(token => token.address)).toEqual([held.address])

  const complete = { ...inventory, complete: true }
  expect(buildInventoryBalanceMap(tokens, complete)[missing.address]?.quotient.toString()).toBe('0')
})
