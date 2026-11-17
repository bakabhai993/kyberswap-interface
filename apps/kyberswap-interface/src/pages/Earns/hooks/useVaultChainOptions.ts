import { useMemo } from 'react'

import { MenuOption } from 'components/DropdownMenu'
import { NETWORKS_INFO } from 'constants/networks'
import { useChainLogos } from 'hooks/useChainLogo'
import { VAULT_CHAIN_IDS } from 'pages/Earns/constants/vaultFilters'
import { AllChainsOption } from 'pages/Earns/hooks/useSupportedDexesAndChains'

/** Chain filter options for the vault pages; see `constants/vaultFilters` for why they are spelled out. */
const useVaultChainOptions = (): MenuOption[] => {
  const getChainLogo = useChainLogos()

  return useMemo(
    () => [
      // The shared option reads "All Chains"; the vault pages have always said "All Networks".
      { ...AllChainsOption, label: 'All Networks' },
      ...VAULT_CHAIN_IDS.map(chainId => ({
        label: NETWORKS_INFO[chainId].name,
        value: String(chainId),
        icon: getChainLogo(chainId),
      })),
    ],
    [getChainLogo],
  )
}

export default useVaultChainOptions
