import { formatAprNumber } from '@kyber/utils/dist/number'
import { ChainId } from '@kyberswap/ks-sdk-core'
import { PropsWithChildren, useMemo } from 'react'

import TokenLogo from 'components/TokenLogo'
import { MouseoverTooltipDesktopOnly } from 'components/Tooltip'
import { useChainLogos } from 'hooks/useChainLogo'
import { MerklOpportunity } from 'pages/Earns/types'

type Props = PropsWithChildren<{
  egApr?: number
  lmApr?: number
  dexLogo?: string
  dexName?: string
  merklOpportunity?: MerklOpportunity
}>

export default function PositionAprTooltip({ egApr, lmApr, dexLogo, dexName, merklOpportunity, children }: Props) {
  const getChainLogo = useChainLogos()
  const campaignRows = useMemo(() => {
    if (!merklOpportunity?.campaigns.length) return []

    return merklOpportunity.campaigns.map(campaign => {
      const reward = merklOpportunity.rewardsRecord.breakdowns.find(item => item.campaignId === campaign.id)
      const rewardChainId = reward?.token.chainId as ChainId | undefined

      return {
        id: campaign.id,
        name: merklOpportunity.protocol.name,
        icon: merklOpportunity.protocol.icon || (rewardChainId ? getChainLogo(rewardChainId) : undefined),
        apr: campaign.apr,
      }
    })
  }, [merklOpportunity, getChainLogo])

  const hasContent = !!egApr || !!lmApr || campaignRows.length > 0

  if (!hasContent) return <>{children}</>

  return (
    <MouseoverTooltipDesktopOnly
      placement="top"
      width="fit-content"
      text={
        <div className="flex flex-col gap-2">
          {!!egApr && (
            <div className="flex items-center gap-1">
              <TokenLogo src={dexLogo} size={16} />
              <span className="text-xs text-subText">
                {dexName} EG | {formatAprNumber(egApr)}%
              </span>
            </div>
          )}
          {!!lmApr && (
            <div className="flex items-center gap-1">
              <TokenLogo src={dexLogo} size={16} />
              <span className="text-xs text-subText">
                {dexName} LM | {formatAprNumber(lmApr)}%
              </span>
            </div>
          )}
          {campaignRows.map(row => (
            <div key={row.id} className="flex items-center gap-1">
              <TokenLogo src={row.icon} size={16} />
              <span className="text-xs text-subText">
                {row.name} | {formatAprNumber(row.apr)}%
              </span>
            </div>
          ))}
        </div>
      }
    >
      {children}
    </MouseoverTooltipDesktopOnly>
  )
}
