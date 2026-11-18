import { t } from '@lingui/macro'

/**
 * Resolve one CTA from the current form/execution snapshot; the first matching condition wins.
 * Callers own data fetching and handlers. These resolvers neither start operations nor retain state.
 * `review` selects the shared swap button, which still handles processing, loading and price impact.
 */
type PrerequisiteAction = { type: 'blocked'; label: string; busy?: boolean } | { type: 'connect' | 'switch-network' }

type SwapPrerequisites = {
  tokensLoading?: boolean
  hasTokens: boolean
  pairError?: string
  hasAmount: boolean
  chainError?: string
  walletRestoring?: boolean
  connected: boolean
  wrongNetwork: boolean
  selectTokenLabel: string
  enterAmountLabel: string
}

// Validate the form before asking for a wallet. Quote loading must not hide Connect/Switch Network.
// Returning undefined lets the engine apply its own execution prerequisites.
const getPrerequisiteAction = (input: SwapPrerequisites): PrerequisiteAction | undefined => {
  if (input.tokensLoading) return { type: 'blocked', label: t`Loading tokens` }
  if (!input.hasTokens) return { type: 'blocked', label: input.selectTokenLabel }
  if (input.pairError) return { type: 'blocked', label: input.pairError }
  if (!input.hasAmount) return { type: 'blocked', label: input.enterAmountLabel }
  if (input.chainError) return { type: 'blocked', label: input.chainError }
  if (input.walletRestoring) return { type: 'blocked', label: t`Swap` }
  if (!input.connected) return { type: 'connect' }
  if (input.wrongNetwork) return { type: 'switch-network' }
  return undefined
}

type SingleChainActionInput = SwapPrerequisites & {
  wrapError?: string
  isWrap: boolean
  noRoute: boolean
  inputError?: string
  needsApproval: boolean
}

type SingleChainAction = PrerequisiteAction | { type: 'wrap' | 'approve' | 'review' }

export const getSingleChainAction = (input: SingleChainActionInput): SingleChainAction => {
  const prerequisite = getPrerequisiteAction(input)
  if (prerequisite) return prerequisite

  // Wrap/unwrap has its own validation and execution; it does not require an aggregator route.
  if (input.wrapError) return { type: 'blocked', label: input.wrapError }
  if (input.isWrap) return { type: 'wrap' }

  // Preserve same-chain error precedence; approval is offered only after these blockers clear.
  if (input.noRoute) return { type: 'blocked', label: t`Insufficient liquidity for this trade` }
  if (input.inputError) return { type: 'blocked', label: input.inputError }
  if (input.needsApproval) return { type: 'approve' }
  return { type: 'review' }
}

type CrossChainActionInput = SwapPrerequisites & {
  approving: boolean
  recipientError?: string
  findingRoute: boolean
  checkingApproval: boolean
  hasQuote: boolean
  insufficientBalance: boolean
  executable: boolean
  needsApproval: boolean
}

type CrossChainAction = PrerequisiteAction | { type: 'approve' | 'review' }

export const getCrossChainAction = (input: CrossChainActionInput): CrossChainAction => {
  const prerequisite = getPrerequisiteAction(input)
  if (prerequisite) return prerequisite

  // Keep approval progress visible, and show recipient failures before quote-loading feedback.
  if (input.approving) return { type: 'blocked', label: t`Approving`, busy: true }
  if (input.recipientError) return { type: 'blocked', label: input.recipientError }
  if (input.findingRoute) return { type: 'blocked', label: t`Finding the best route`, busy: true }
  if (input.checkingApproval) return { type: 'blocked', label: t`Checking approval`, busy: true }
  if (!input.hasQuote) return { type: 'blocked', label: t`No route found` }
  if (input.insufficientBalance) return { type: 'blocked', label: t`Insufficient Balance` }

  // A displayed quote may still be read-only or belong to the previous sender/recipient.
  // Require an executable replacement before offering approval or review.
  if (!input.executable) return { type: 'blocked', label: t`Refreshing route`, busy: true }
  if (input.needsApproval) return { type: 'approve' }
  return { type: 'review' }
}
