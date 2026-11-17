import { ChainId } from '@kyberswap/ks-sdk-core'

import EtherFiLogo from 'assets/svg/earn/ic_logo_etherfi.svg'
import { MenuOption } from 'components/DropdownMenu'
import { AllProtocolsOption } from 'pages/Earns/hooks/useSupportedDexesAndChains'

/**
 * Filter options for the vault pages (the chain options, which carry a configured logo, come from
 * `useVaultChainOptions`).
 *
 * Spelled out rather than derived from the vault list: deriving them meant fetching the whole list
 * a second time — the page's own copy is filtered, so it cannot say which chains and partners exist
 * once a filter is on.
 *
 * Both "All …" entries send no filter, so a vault the API starts serving on another chain or from
 * another partner still appears in the list; only its dropdown entry waits for a release.
 */

/** The chains vaults are listed on. */
export const VAULT_CHAIN_IDS: ChainId[] = [ChainId.MAINNET]

/** Matches `provider.key` in the vault API, which is what the list endpoint filters on. */
export const ETHERFI_PROVIDER_KEY = 'etherfi'

export const VAULT_PROTOCOL_OPTIONS: MenuOption[] = [
  AllProtocolsOption,
  // The API returns an empty `provider.logo` for ether.fi, so the mark is bundled.
  { label: 'ether.fi', value: ETHERFI_PROVIDER_KEY, icon: EtherFiLogo },
]
