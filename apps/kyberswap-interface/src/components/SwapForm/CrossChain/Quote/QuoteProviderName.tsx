import type { Quote } from 'services/crossChain/registry'

export const QuoteProviderName = ({ quote: { adapter }, showIcon = true }: { quote: Quote; showIcon?: boolean }) => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap">
    {showIcon && adapter.getIcon && <img src={adapter.getIcon()} alt="" width={14} height={14} className="shrink-0" />}
    <span className="font-medium">{adapter.getName()}</span>
  </span>
)
