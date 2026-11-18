# SwapForm

Shared form, quote and execution components for Unified Swap and embedded EVM swaps.
The [Swap page](../../pages/Swap/README.md) owns pair/amount selection, the shared
EVM recipient draft and History visibility. `SwapForm.tsx` maps the active quote
into `UnifiedSwapForm`, which owns amount display and balances. `SwapFormLayout` composes panels, details and actions.

## Structure and ownership

| Module                                                                 | Responsibility                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `SingleChain/`                                                         | EVM quote provider, review/build coordination and submission.                   |
| `CrossChain/CrossChainSwapProvider.tsx` and `CrossChainSwapEngine.tsx` | Stable lazy boundary and coordination of quote, recipient and execution owners. |
| `CrossChain/Quote/`                                                    | Stream requests, pools, selection, refresh, Gas Drop and quote presentation.    |
| `CrossChain/Execution/`                                                | Approval, review prerequisites, confirmation and wallet submission.             |
| `CrossChain/hooks/`                                                    | Pair metadata, recipient state and balances.                                    |
| `hooks/`                                                               | Shared form input/recipient logic and same-chain request/build lifecycle.       |
| `CurrencyInput/`                                                       | EVM amount fields and ERC-8056 display conversion.                              |
| `Quote/`, `SwapModal/`                                                 | Shared quote and review presentation.                                           |
| `SwapActionButton/`                                                    | Same-chain prerequisites, approval/permit, wrap/unwrap and review entry.        |
| `Settings/`, `Warnings/`                                               | Preferences, sources, recipient settings and risk presentation.                 |

`SwapFormContext` supplies same-chain display data. Quote lifecycles belong to
`SingleChainSwapProvider` and `CrossChainSwapProvider`, shared by the form and route
panel. The cross-chain engine reads the page-owned amount without receiving a setter.
Signing connections belong to [SwapWallets](../SwapWallets/); committed token
selection belongs to the pair owner, while [TokenSelectorModal](../TokenSelectorModal/README.md)
owns browsing and selection interaction.

`swapAction.ts` owns CTA priority: both engines share form and wallet prerequisites,
then apply their execution requirements. Each resolver returns one action for the
UI to render; connect, approval, wrap and review handlers stay with their existing
owners. Change CTA precedence here rather than duplicating guards in JSX.

## Form and loading boundaries

The cross-chain wallet providers and engine load on first use and stay mounted
across mode changes. Same-chain entry does not load non-EVM wallet SDKs. Switching
to same-chain disables cross-chain requests and invalidates its quote/review while
preserving pair, amount and recipient drafts outside the lazy boundary.

Both modes share input/output fields. Loading previews preserve the fields and
page layout without starting another quote or wallet lifecycle. Currency panels
own selector visibility; form owners calculate amounts and commit selections.
ERC-8056 display conversion stays at the input/output boundary; quotes, approvals
and execution use raw token units.

## Quotes and review

Same-chain requests use `useRouteRequest` and `useGetRoute`; the provider shares
one route with the form and route panel. `useBuildRoute` builds the reviewed
payload using its sender, recipient, slippage, permit and attribution. Confirmation
executes that payload and router, not a newer displayed quote. Wrap/unwrap uses
its dedicated callback instead of aggregator quote/build.

Cross-chain requests use the aggregator stream. Adapters execute normalized built
quotes and track transactions. Preview quotes with placeholder addresses are
read-only. [Quote and Gas Drop](CrossChain/Quote/README.md) documents pool ownership
and mode selection. Provider payloads, spender/router and quote credentials must
survive normalization for execution and reconciliation.

Opening review freezes its quote and pauses refresh. Submit consumes the cached
quote immediately; closing resumes fetching without resurrecting consumed data.
Closing an unsubmitted review can reuse a fresh quote. Review identities and
submission guards prevent stale asynchronous results from replacing a newer session.
Degen Mode and allowance checks belong to the review/execution controller.

Submission persists the source hash even if review has closed. UI callbacks detach
on dismissal, but transaction persistence and backend registration continue.
[Transaction state](../../state/crossChainSwap/) owns reconciliation and settlement;
submitted does not mean settled.

Formo follows the [Unified Swap event contract](https://app.notion.com/p/41b26751887e8061970cfd89700d4e3b).
Pair tracking belongs to `useSwapFormPair`; selectors track applied choices.
Review, execution and transaction updaters own their respective events. Quote tracking
captures the reviewed provider and Gas Drop option; source broadcast is distinct from
settlement (`SUCCESS`, `FAILED`, `REFUNDED`). Settings and route events follow committed
changes and user interactions, never default route selection. The detailed Gas Drop
prompt name in the contract is `Swap Gas Drop Switch`.

Single-chain and KyberCross share a controlled allowance selector. Each action owns
its selection: single-chain defaults to Infinite, KyberCross to Exact; other
cross-chain providers always use Exact. The shared approval hook owns scoped
allowance reads and transaction submission. Zero-reset approvals remain pending
until confirmed and require another approval to grant spending permission.

## Recipients and extension points

The EVM recipient draft is shared across modes. Non-EVM routes use the selected
receiver connection or pasted recipient owned by `useCrossChainRecipient`.
Recipient popups own temporary edits and apply through the recipient owner.
Clearing a draft restores the wallet receiver; collapsing preserves the draft.
Resolution and validation belong to `useRecipientAddress`, including ENS and
non-EVM checks. ENS uses the Universal Resolver first, with direct resolver reads
as a legacy fallback; unresolved RPC failures retain query retries. Pending or
invalid recipients cannot execute.

Change form geometry in `UnifiedSwapForm`/`SwapFormLayout`, quote behavior in its
mode's provider/hooks, and submission behavior in its execution owner. Keep lazy
boundaries and shared quote subscriptions intact when moving components. Update
loading previews alongside layout changes. Shared amount and recipient controls
also serve embedded swaps.
