import { useEffect, useRef } from 'react'

import { TAB } from 'components/TradeLayout/Tabs'
import useTracking, { TRACKING_EVENT_TYPE } from 'hooks/useTracking'
import { useAppSelector } from 'state/hooks'
import { useSwapCurrencyResolution } from 'state/swap/hooks'

/** One session spans Settings and its source subpanels. Recipient lives in the form, preferences in Redux. */
export const useSwapSettingsTracking = (tab: TAB, recipient: string) => {
  const { trackingHandler } = useTracking()
  const { fromCurrency, toCurrency, inputChain, outputChain, currencyIn, currencyOut } = useSwapCurrencyResolution()
  const snapshot = useAppSelector(state =>
    JSON.stringify([
      state.user.userSlippageTolerance,
      state.user.userDeadline,
      state.user.userDegenMode,
      state.user.showPricingChart,
      state.user.showTradeRoutes,
      state.user.successSoundEnabled,
      state.user.isSlippageControlPinned,
      state.customizeDexes.excludeDexes,
      state.crossChainSwap.excludedSources,
      recipient,
    ]),
  )
  const session = useRef<{ snapshot: string; changed: boolean } | undefined>(undefined)
  const visible = [TAB.SETTINGS, TAB.LIQUIDITY_SOURCES, TAB.CROSS_CHAIN_SOURCES].includes(tab)
  useEffect(() => {
    const current = session.current
    const payload = {
      from_token: currencyIn?.symbol,
      to_token: currencyOut?.symbol,
      from_token_address: currencyIn?.isNative ? 'NATIVE' : currencyIn?.wrapped?.address,
      to_token_address: currencyOut?.isNative ? 'NATIVE' : currencyOut?.wrapped?.address,
      from_token_id: fromCurrency,
      to_token_id: toCurrency,
      from_chain_id: inputChain,
      to_chain_id: outputChain,
      mode: inputChain === outputChain ? 'same-chain' : 'cross-chain',
    }
    if (visible) {
      if (!current) {
        session.current = { snapshot, changed: false }
        trackingHandler(TRACKING_EVENT_TYPE.SWAP_SETTINGS_OPENED, payload)
      } else if (current.snapshot !== snapshot) current.changed = true
    } else if (current) {
      session.current = undefined
      trackingHandler(TRACKING_EVENT_TYPE.SWAP_SETTINGS_CLOSED, {
        ...payload,
        settings_changed: current.changed || current.snapshot !== snapshot,
      })
    }
  }, [visible, snapshot, fromCurrency, toCurrency, currencyIn, currencyOut, inputChain, outputChain, trackingHandler])
}
