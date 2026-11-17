import { useEffect, useRef } from 'react'

import useTracking, { TRACKING_EVENT_TYPE } from 'hooks/useTracking'
import type { Chain } from 'types/crossChain'

export const useRecipientTracking = (
  draft: string,
  address: string | undefined,
  loading: boolean,
  chain: Chain | undefined,
  mode: string,
) => {
  const { trackingHandler } = useTracking()
  const pending = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (pending.current !== draft || !draft || !address || loading) return
    pending.current = undefined
    trackingHandler(TRACKING_EVENT_TYPE.SWAP_RECIPIENT_APPLIED, {
      to_chain_id: chain,
      recipient_address: address,
      mode,
    })
  }, [draft, address, loading, chain, mode, trackingHandler])
  return {
    changed: (value: string) => {
      pending.current = value
    },
    opened: () =>
      trackingHandler(TRACKING_EVENT_TYPE.SWAP_RECIPIENT_OPENED, {
        to_chain_id: chain,
        recipient_address: address,
        mode,
      }),
  }
}
