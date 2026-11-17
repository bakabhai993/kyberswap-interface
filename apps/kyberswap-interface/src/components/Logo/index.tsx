import { ChainId, Currency } from '@kyberswap/ks-sdk-core'
import { ImgHTMLAttributes, useState } from 'react'

import UnknownToken from 'assets/svg/kyber/unknown-token.svg'
import { useChainLogoStatus } from 'hooks/useChainLogo'
import { WrappedTokenInfo } from 'state/lists/wrappedTokenInfo'
import { Chain } from 'types/crossChain'
import { isKnownChain } from 'utils/chainLogo'
import { cn } from 'utils/cn'
import { isNativeAsset } from 'utils/nativeErc20'
import { getNativeTokenLogo } from 'utils/tokenLogo'

const BAD_SRCS: { [tokenAddress: string]: true } = {}

interface LogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  srcs: string[]
  size?: string | number
}

/**
 * Renders an image by sequentially trying a list of URIs, and then eventually a fallback triangle alert.
 */
export default function Logo({ srcs, alt, ...rest }: LogoProps) {
  const [, refresh] = useState<number>(0)

  const src: string | undefined = srcs.find(s => !BAD_SRCS[s])

  return (
    <img
      {...rest}
      alt={alt}
      src={src || UnknownToken}
      onError={() => {
        if (src) BAD_SRCS[src] = true
        refresh(i => i + 1)
      }}
    />
  )
}

type NetworkLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { chainId: Chain }

/**
 * The logo of a chain, as configured in ks-setting. Shows a placeholder of the same size until the
 * config has answered, and the unknown-token mark when the chain has no logo or its image fails to
 * load. Renders nothing for a chain the app has no entry for.
 */
export function NetworkLogo({ chainId, alt = '', className, ...rest }: NetworkLogoProps) {
  const { logo, isPending } = useChainLogoStatus(chainId)
  if (!isKnownChain(chainId)) return null

  if (isPending) {
    // The placeholder stands in for the image, so it keeps the chain's name: the tooltip, the
    // accessible name and server-rendered markup all still say which chain it is
    const label = alt || rest.title
    return (
      <span
        {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
        title={rest.title}
        className={cn('inline-block shrink-0 animate-pulse rounded-full bg-white-08', className)}
        // Callers size the image through either attributes or style; the placeholder honours both
        style={{ width: rest.width, height: rest.height, ...rest.style }}
      />
    )
  }

  return (
    <Logo
      {...rest}
      alt={alt}
      // Configured logos are not guaranteed to be square
      className={cn('object-contain', className)}
      srcs={logo ? [logo] : []}
    />
  )
}

export function TokenLogoWithChain(data: {
  tokenLogo: string
  chainId: ChainId
  size: number | string
}): React.JSX.Element
export function TokenLogoWithChain(data: {
  size: number | string
  currency: Currency | WrappedTokenInfo
}): React.JSX.Element
export function TokenLogoWithChain(data: any) {
  const { tokenLogo: tokenLogoParam, chainId: chainParam, size, currency } = data

  const chainId: ChainId = currency?.chainId || chainParam
  const nativeLogo = getNativeTokenLogo(chainId)
  const tokenLogo = (isNativeAsset(currency) ? nativeLogo : currency?.logoURI) || tokenLogoParam
  const ratio = 0.7
  const networkSize = ratio * parseInt(size + '')

  return (
    <div style={{ position: 'relative', height: size }}>
      <Logo srcs={[tokenLogo ?? '']} style={{ width: size, height: size, borderRadius: '4px' }} />
      <NetworkLogo
        chainId={chainId}
        style={{
          position: 'absolute',
          width: networkSize,
          height: networkSize,
          top: -8 * ratio,
          right: -8 * ratio,
          zIndex: 1,
        }}
      />
    </div>
  )
}

// Soft white halo (4px close + 70px wide bloom) at 20% alpha.
const shadowClasses = 'shadow-[0_4px_5px_0_rgba(255,255,255,0.2),0_1px_70px_0_rgba(255,255,255,0.2)]'

export const TokenLogoWithShadow = ({ size, style, className, ...rest }: LogoProps & { size?: string }) => (
  <Logo
    {...rest}
    style={{ width: size, height: size, ...style }}
    className={cn('rounded-full', shadowClasses, className)}
  />
)
TokenLogoWithShadow.displayName = 'TokenLogoWithShadow'
