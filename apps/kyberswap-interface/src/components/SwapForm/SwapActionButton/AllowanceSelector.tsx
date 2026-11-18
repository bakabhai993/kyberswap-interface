import { t } from '@lingui/macro'

import InfoHelper from 'components/InfoHelper'
import Select from 'components/Select'
import { HStack } from 'components/Stack'

export enum AllowanceType {
  EXACT = 'EXACT',
  INFINITE = 'INFINITE',
}

type Props = {
  value: AllowanceType
  onChange: (value: AllowanceType) => void
  disabled?: boolean
}

export default function AllowanceSelector({ value, onChange, disabled }: Props) {
  return (
    <HStack className="items-center justify-end">
      <Select
        value={value}
        className="bg-transparent p-0 text-xs font-medium text-subText"
        optionStyle={{ fontSize: '14px' }}
        options={[
          {
            value: AllowanceType.INFINITE,
            label: t`Infinite Allowance`,
            disabled,
            onSelect: () => onChange(AllowanceType.INFINITE),
          },
          {
            value: AllowanceType.EXACT,
            label: t`Exact Allowance`,
            disabled,
            onSelect: () => onChange(AllowanceType.EXACT),
          },
        ]}
        activeRender={selected =>
          selected ? (
            <HStack className="items-center gap-1">
              {selected.label}
              <InfoHelper
                margin={false}
                text={
                  selected.value === AllowanceType.EXACT
                    ? t`You wish to give KyberSwap permission to use the exact allowance token amount as the amount in for this transaction, Subsequent transactions will require your permission again.`
                    : t`You wish to give KyberSwap permission to use the selected token for transactions without any limit. You do not need to give permission again unless revoke.`
                }
              />
            </HStack>
          ) : null
        }
      />
    </HStack>
  )
}
