import { useCallback } from 'react'
import ksSettingApi from 'services/ksSetting'

import { type Chain } from 'types/crossChain'
import { findChainLogo, getPersistedChainLogos, resolveChainLogo } from 'utils/chainLogo'

/**
 * The chain logos configured in ks-setting. Reads the `chains` request without issuing it — the
 * lists updater at the app root owns the fetch — and holds the previous visit's logos until this
 * visit's response arrives.
 */
const useConfiguredChainLogos = () =>
  ksSettingApi.endpoints.getChainLogos.useQueryState(undefined, {
    selectFromResult: ({ data, isUninitialized, isLoading }) => ({
      logos: data ?? getPersistedChainLogos(),
      // No answer yet: the request has not been issued or is still in flight for the first time
      isPending: !data && (isUninitialized || isLoading),
    }),
  })

/**
 * Returns a lookup for chain logos, for callers that resolve several chains or build data outside
 * JSX. Its identity changes when the configured logos do, so it is safe as a hook dependency.
 */
export const useChainLogos = (): ((chain: Chain) => string) => {
  const { logos } = useConfiguredChainLogos()
  return useCallback((chain: Chain) => resolveChainLogo(logos, chain), [logos])
}

/** The image of one chain as a URL. Prefer `NetworkLogo` when it goes straight into an `<img>`. */
export const useChainLogo = (chain: Chain): string => resolveChainLogo(useConfiguredChainLogos().logos, chain)

/**
 * The logo of one chain together with whether it may still arrive: `isPending` holds while the
 * chain has no logo yet and the config has not answered.
 */
export const useChainLogoStatus = (chain: Chain): { logo: string | undefined; isPending: boolean } => {
  const { logos, isPending } = useConfiguredChainLogos()
  const logo = findChainLogo(logos, chain)
  return { logo, isPending: !logo && isPending }
}
