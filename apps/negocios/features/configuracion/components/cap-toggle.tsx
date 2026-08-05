import { Icon, ToggleSwitch } from '@tindivo/ui'
import type { Form } from '../types'

interface CapToggleProps {
  icon: string
  title: string
  desc: string
  checked: boolean
  field: keyof Form
  onChange: (field: keyof Form, value: boolean) => void
  disabled?: boolean
}

export function CapToggle({
  icon,
  title,
  desc,
  checked,
  field,
  onChange,
  disabled,
}: CapToggleProps) {
  return (
    <ToggleSwitch
      checked={checked}
      onChange={(next) => onChange(field, next)}
      disabled={disabled}
      label={title}
      description={desc}
      icon={
        <Icon
          name={icon}
          size={22}
          filled={checked}
          className={checked ? 'text-brand' : 'text-ink-muted'}
        />
      }
    />
  )
}
