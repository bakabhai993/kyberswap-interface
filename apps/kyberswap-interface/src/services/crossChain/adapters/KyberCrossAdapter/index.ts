import { ChainId, Currency } from '@kyberswap/ks-sdk-core'
import { BaseSwapAdapter } from 'services/crossChain/adapters/BaseSwapAdapter'
import { kyberCrossApi } from 'services/crossChain/adapters/KyberCrossAdapter/api'
import { chainIdToViemChain } from 'services/crossChain/adapters/KyberCrossAdapter/chains'
import { KyberCross } from 'services/crossChain/adapters/KyberCrossAdapter/constants'
import { executeKyberCross } from 'services/crossChain/adapters/KyberCrossAdapter/service'
import {
  NormalizedProvider,
  getKyberCrossRoutePlan,
  getKyberCrossRouteSnapshot,
  mapRouteStateToSwapStatus,
  normalizeProvider,
  parseKyberCrossQuote,
} from 'services/crossChain/adapters/KyberCrossAdapter/utils'
import { Quote } from 'services/crossChain/registry'
import { type Address, type Hash, WalletClient } from 'viem'

import kyberswapIcon from 'assets/images/kyberswap.ico'
import { ZERO_ADDRESS } from 'constants/index'
import { NormalizedTxResponse, SwapStatus } from 'types/crossChain'

export class KyberCrossAdapter extends BaseSwapAdapter {
  getName(): string {
    return KyberCross
  }

  getIcon(): string {
    return kyberswapIcon
  }

  async executeSwap(quote: Quote, walletClient: WalletClient): Promise<NormalizedTxResponse> {
    const normalizedQuote = quote.quote
    const quoteParams = normalizedQuote.quoteParams
    const rawQuote = parseKyberCrossQuote(normalizedQuote.rawQuote)
    const quoteData = rawQuote.data
    const routePlan = getKyberCrossRoutePlan(rawQuote)

    if (!quoteData || !routePlan) {
      throw new Error('Missing KyberCross route plan')
    }

    const kyberCrossRoute = getKyberCrossRouteSnapshot(routePlan)
    const normalizedRouteProvider = normalizeProvider(routePlan.bridge.provider)
    const build = quoteData.build

    const buildTx = build.tx

    const originChainId = quoteParams.fromChain as ChainId
    const originChain = chainIdToViemChain[originChainId]
    if (!originChain) throw new Error(`Unsupported chain: ${originChainId}`)

    const fromToken = quoteParams.fromToken as Currency
    const isNativeToken = rawQuote.isNativeToken || fromToken.isNative
    const bridgeMetadata = routePlan.bridge.metadata
    const nearIntentsDepositAddress =
      normalizedRouteProvider === NormalizedProvider.NearIntents
        ? typeof bridgeMetadata?.deposit_address === 'string'
          ? bridgeMetadata.deposit_address
          : undefined
        : undefined

    const txHash = await executeKyberCross({
      walletClient,
      originChain,
      userAddress: quoteParams.sender as Address,
      buildTx,
      inputToken: (isNativeToken ? ZERO_ADDRESS : fromToken.wrapped.address) as Address,
      inputAmount: BigInt(quoteParams.amount),
      isNativeToken,
      infiniteApproval: false,
    })

    return {
      kyberCrossRoute,
      sender: quoteParams.sender,
      sourceTxHash: txHash,
      adapter: this.getName(),
      id: nearIntentsDepositAddress || txHash,
      depositAddress: nearIntentsDepositAddress,
      sourceChain: quoteParams.fromChain,
      targetChain: quoteParams.toChain,
      inputAmount: quoteParams.amount,
      outputAmount: normalizedQuote.outputAmount.toString(),
      sourceToken: quoteParams.fromToken,
      targetToken: quoteParams.toToken,
      timestamp: new Date().getTime(),
      amountInUsd: normalizedQuote.inputUsd,
      amountOutUsd: normalizedQuote.outputUsd,
      platformFeePercent: normalizedQuote.platformFeePercent,
      recipient: quoteParams.recipient,
      gasDrop: normalizedQuote.gasDrop,
      ...(normalizedQuote.gasDrop ? { gasDropStatus: { status: 'Pending' as const } } : {}),
    }
  }

  async getTransactionStatus(params: NormalizedTxResponse): Promise<SwapStatus> {
    try {
      const trackingExecution = await kyberCrossApi.scanTxStatus(params.sourceTxHash as Hash)

      return mapRouteStateToSwapStatus(trackingExecution.data.route_execution, !!params.gasDrop)
    } catch {
      return {
        txHash: '',
        status: 'Processing',
      }
    }
  }
}
