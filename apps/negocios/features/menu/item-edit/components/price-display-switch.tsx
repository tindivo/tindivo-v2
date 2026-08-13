import { Icon, ToggleSwitch } from '@tindivo/ui'
import type { PriceDisplay } from '../types'

interface PriceDisplaySwitchProps {
  value: PriceDisplay
  /**
   * Nombre del grupo que ya manda sobre el precio del plato. Solo uno puede:
   * con dos, el precio base tendría que ser el más barato de los dos a la vez
   * y ninguna de las dos listas cuadraría.
   */
  blockedBy: string | null
  onChange: (mode: PriceDisplay) => void
}

/**
 * El icono es `payments` y no `sell`, que pegaría mejor: el panel auto-hospeda
 * un subset de Material Symbols y `sell` no está en `public/fonts/icons.txt`,
 * así que se leería el nombre en texto plano.
 */
export function PriceDisplaySwitch({ value, blockedBy, onChange }: PriceDisplaySwitchProps) {
  const isTotal = value === 'total'
  const disabled = !isTotal && blockedBy !== null

  const description = disabled
    ? `Ya lo hace el grupo "${blockedBy}". Solo un grupo puede definir el precio.`
    : isTotal
      ? 'Escribe el precio final de cada opción. El precio base del plato es el de la más barata.'
      : 'Actívalo para tamaños o presentaciones: Pequeña S/ 13, Mediana S/ 26. Déjalo apagado para extras que suman (+ S/ 2).'

  return (
    <div
      className={`mb-3.5 rounded-xl border-[1.5px] px-3.5 py-3 ${
        isTotal ? 'border-info/30 bg-info/[0.06]' : 'border-ink/[0.06] bg-surface'
      }`}
    >
      <ToggleSwitch
        checked={isTotal}
        disabled={disabled}
        onChange={(checked) => onChange(checked ? 'total' : 'delta')}
        label="Estas opciones son el precio del plato"
        description={description}
        icon={<Icon name="payments" size={18} filled={isTotal} />}
      />
    </div>
  )
}
