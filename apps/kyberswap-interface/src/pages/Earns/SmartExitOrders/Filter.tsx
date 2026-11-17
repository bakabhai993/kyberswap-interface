import { ChainId } from '@kyberswap/ks-sdk-core'
import { useCallback, useEffect, useMemo } from 'react'

import DropdownMenu from 'components/DropdownMenu'
import { useChainLogos } from 'hooks/useChainLogo'
import { NETWORKS_INFO } from 'hooks/useChainsConfig'
import { EARN_CHAINS, EARN_DEXES } from 'pages/Earns/constants'
import { AllChainsOption, AllProtocolsOption } from 'pages/Earns/hooks/useSupportedDexesAndChains'
import { OrderStatus, SmartExitFilter } from 'pages/Earns/types'

const ORDER_STATUS = [
  { label: 'All Status', value: '' },
  { label: 'Active', value: OrderStatus.OrderStatusOpen },
  { label: 'Executed', value: OrderStatus.OrderStatusDone },
  { label: 'Expired', value: OrderStatus.OrderStatusExpired },
  { label: 'Cancelled', value: OrderStatus.OrderStatusCancelled },
]

const SUPPORTED_CHAIN_IDS = Object.entries(EARN_CHAINS)
  .filter(([_, chainInfo]) => chainInfo.smartExitSupported)
  .map(([chainId]) => Number(chainId) as ChainId)

const SUPPORTED_DEXES = Object.entries(EARN_DEXES)
  .filter(([_, dexInfo]) => dexInfo.smartExitDexType)
  .map(([_, dexInfo]) => ({
    label: dexInfo.name,
    value: dexInfo.smartExitDexType as string,
    icon: dexInfo.logo,
  }))

const DEX_OPTIONS = [AllProtocolsOption, ...SUPPORTED_DEXES]

export default function Filter({
  filters,
  updateFilters,
}: {
  filters: SmartExitFilter
  updateFilters: (key: keyof SmartExitFilter, value: string | number) => void
}) {
  const getChainLogo = useChainLogos()
  const chainOptions = useMemo(
    () => [
      AllChainsOption,
      ...SUPPORTED_CHAIN_IDS.map(chainId => ({
        label: NETWORKS_INFO[chainId].name,
        value: String(chainId),
        icon: getChainLogo(chainId),
      })),
    ],
    [getChainLogo],
  )

  const handleChainChange = useCallback(
    (value: string | number) => {
      const stringValue = String(value)
      if (stringValue !== filters.chainIds) {
        updateFilters('chainIds', stringValue)
      }
    },
    [filters.chainIds, updateFilters],
  )

  const handleDexChange = useCallback(
    (value: string | number) => {
      const stringValue = String(value)
      if (stringValue !== filters.dexTypes) {
        updateFilters('dexTypes', stringValue)
      }
    },
    [filters.dexTypes, updateFilters],
  )

  const handleStatusChange = useCallback(
    (value: string | number) => {
      const stringValue = String(value)
      if (stringValue !== filters.status) {
        updateFilters('status', stringValue)
      }
    },
    [filters.status, updateFilters],
  )

  useEffect(() => {
    if (
      filters.dexTypes &&
      !SUPPORTED_DEXES.map(item => item.value)
        .filter(Boolean)
        .includes(filters.dexTypes)
    ) {
      updateFilters('dexTypes', '')
    }
  }, [filters.dexTypes, updateFilters])

  return (
    <div className="flex flex-wrap gap-4 max-sm:w-full max-sm:gap-3">
      <div className="contents max-sm:flex max-sm:w-full max-sm:gap-2">
        <DropdownMenu
          mobileHalfWidth
          value={filters.chainIds || ''}
          options={chainOptions}
          onChange={handleChainChange}
        />
        <DropdownMenu mobileHalfWidth value={filters.dexTypes || ''} options={DEX_OPTIONS} onChange={handleDexChange} />
      </div>
      <DropdownMenu mobileFullWidth options={ORDER_STATUS} value={filters.status || ''} onChange={handleStatusChange} />
    </div>
  )
}
