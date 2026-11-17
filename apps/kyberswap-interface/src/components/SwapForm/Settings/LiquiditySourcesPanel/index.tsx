import { ChainId } from '@kyberswap/ks-sdk-core'
import { Trans, t } from '@lingui/macro'
import { useEffect, useRef, useState } from 'react'

import Checkbox from 'components/CheckBox'
import { HStack, Stack } from 'components/Stack'
import { LiquiditySourceGroup } from 'components/SwapForm/Settings/LiquiditySourcesPanel/Group'
import { SearchBar } from 'components/SwapForm/Settings/LiquiditySourcesPanel/SearchBar'
import {
  BackIconWrapper,
  ImageWrapper,
  LiquiditySourceHeader,
  Source,
  SourceList,
  SourceName,
} from 'components/SwapForm/Settings/LiquiditySourcesPanel/components'
import useDebounce from 'hooks/useDebounce'
import useTracking, { TRACKING_EVENT_TYPE } from 'hooks/useTracking'
import { useAllDexes, useExcludeDexes } from 'state/customizeDexes/hooks'

type Props = {
  onBack: () => void
  chainId?: ChainId
}

const LiquiditySourcesPanel = ({ onBack, chainId }: Props) => {
  const [searchText, setSearchText] = useState('')
  const debouncedSearchText = useDebounce(searchText.toLowerCase(), 200).trim()

  const dexes = useAllDexes(chainId)
  const [excludeDexes, setExcludeDexes] = useExcludeDexes(chainId)
  const { trackingHandler } = useTracking()

  const tagMap: { [key: number]: { name: string; id: number; logoURL: string } } = {}
  dexes?.forEach(item => {
    item.tags?.forEach(tag => {
      tagMap[tag.id] = tag
    })
  })

  const checkAllRef = useRef<HTMLInputElement | null>(null)
  const selectedDexes = dexes?.filter(item => !excludeDexes.includes(item.id)) || []

  useEffect(() => {
    if (!checkAllRef.current) return

    if (selectedDexes.length === dexes?.length) {
      checkAllRef.current.checked = true
      checkAllRef.current.indeterminate = false
    } else if (!selectedDexes.length) {
      checkAllRef.current.checked = false
      checkAllRef.current.indeterminate = false
    } else if (selectedDexes.length < (dexes?.length || 0)) {
      checkAllRef.current.checked = false
      checkAllRef.current.indeterminate = true
    }
  }, [dexes?.length, selectedDexes.length])

  const applyExcludedDexes = (next: string[]) => {
    setExcludeDexes(next)
    dexes?.forEach(dex => {
      if (excludeDexes.includes(dex.id) === next.includes(dex.id)) return
      trackingHandler(TRACKING_EVENT_TYPE.SWAP_ROUTING_SOURCE_TOGGLED, {
        source_type: 'liquidity_source',
        mode: 'same-chain',
        source_name: dex.name,
        enabled: !next.includes(dex.id),
        chain_id: chainId,
      })
    })
  }
  const handleToggleDex = (id: string) =>
    applyExcludedDexes(excludeDexes.includes(id) ? excludeDexes.filter(item => item !== id) : [...excludeDexes, id])

  return (
    <Stack className="w-full gap-4">
      <HStack className="items-center gap-1">
        <BackIconWrapper onClick={onBack} />
        <span className="text-lg font-medium text-text">{t`Liquidity Sources`}</span>
      </HStack>

      <Stack className="gap-3">
        <SearchBar value={searchText} onChange={setSearchText} />

        <Stack>
          <LiquiditySourceHeader>
            <HStack className="items-center gap-3">
              <Checkbox
                ref={checkAllRef}
                className="cursor-pointer"
                onChange={e => {
                  if (!e.currentTarget.checked) {
                    applyExcludedDexes(dexes?.map(item => item.id) || [])
                  } else {
                    applyExcludedDexes([])
                  }
                }}
              />
              <span>
                <Trans>Liquidity Sources</Trans>
              </span>
            </HStack>
            <span className="text-subText">
              {selectedDexes.length}/{dexes?.length || 0}
            </span>
          </LiquiditySourceHeader>

          <SourceList>
            {Object.values(tagMap).map(tag => {
              return (
                <LiquiditySourceGroup
                  tag={tag}
                  onChange={applyExcludedDexes}
                  debouncedSearchText={debouncedSearchText}
                  chainId={chainId}
                  key={tag.id}
                />
              )
            })}

            {dexes
              ?.filter(item => !item.tags && item.name.toLowerCase().includes(debouncedSearchText))
              .map(({ name, logoURL, id }) => (
                <Source key={id} onClick={() => handleToggleDex(id)}>
                  <Checkbox
                    checked={!excludeDexes.includes(id)}
                    onChange={() => handleToggleDex(id)}
                    onClick={e => e.stopPropagation()}
                  />

                  <ImageWrapper>
                    <img src={logoURL} alt="" />
                  </ImageWrapper>

                  <SourceName>{name}</SourceName>
                </Source>
              ))}
          </SourceList>
        </Stack>
      </Stack>
    </Stack>
  )
}

export default LiquiditySourcesPanel
