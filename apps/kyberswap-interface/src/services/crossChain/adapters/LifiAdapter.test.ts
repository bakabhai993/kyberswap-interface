import { getStatus } from '@lifi/sdk'
import { LifiAdapter } from 'services/crossChain/adapters/LifiAdapter'
import { describe, expect, it, vi } from 'vitest'

import { NonEvmChain, type NormalizedTxResponse } from 'types/crossChain'

vi.mock('@lifi/sdk', () => ({ createConfig: vi.fn(), getStatus: vi.fn() }))

const tx = {
  sourceChain: 8453,
  targetChain: 4663,
  sourceTxHash: '0x3ff1a34558dbb26d0d024ddc81851c47a0eb5e5345c8b8039296ebb7f418a27e',
} as NormalizedTxResponse
const txHash = '0x7e9c3636531a588bd58d830f76e916e45d327bd3625ecd076fecf9b0d5eba674'

describe('LIFI received amount', () => {
  it.each(['12404064252898847137', '0', undefined])(
    'uses receiving.amount (%s) without falling back to native transaction value',
    async amount => {
      vi.mocked(getStatus).mockResolvedValue({
        status: 'DONE',
        receiving: { txHash, amount, value: '6860368784471522' },
      } as Awaited<ReturnType<typeof getStatus>>)

      expect(await new LifiAdapter().getTransactionStatus(tx)).toEqual({
        txHash,
        status: 'Success',
        amountOut: amount,
      })
    },
  )
})

it('maps a failed Solana source transaction without receiving data to Failed', async () => {
  const sourceTxHash = 'iQqyx19w59Z58zsyDVQKf3NvCniirpdZJfJg2WUBMnAg5wMnPS4zEWeDHyiNkUkqu5vetZjoxktciw7eNK6FLSv'
  vi.mocked(getStatus).mockResolvedValue({
    status: 'FAILED',
    substatus: 'UNKNOWN_FAILED_ERROR',
    substatusMessage: 'Instruction #5 failed - custom program error: 6024',
    sending: { chainId: 1151111081099710, txHash: sourceTxHash },
  } as Awaited<ReturnType<typeof getStatus>>)

  expect(
    await new LifiAdapter().getTransactionStatus({
      ...tx,
      sourceChain: NonEvmChain.Solana,
      targetChain: 56,
      sourceTxHash,
    }),
  ).toEqual({ status: 'Failed', txHash: '', amountOut: undefined })
  expect(getStatus).toHaveBeenLastCalledWith({ fromChain: 'SOL', toChain: 56, txHash: sourceTxHash })
})
