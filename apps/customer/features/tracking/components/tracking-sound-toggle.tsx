'use client'

import { Icon } from '@tindivo/ui'

interface TrackingSoundToggleProps {
  activo: boolean
  onToggle: () => void
}

/**
 * Silenciar los avisos, en la cabecera.
 *
 * Existe por dos motivos y el segundo no es obvio: además de callar la app,
 * encenderlo es un gesto del usuario, y un gesto es lo único que le permite al
 * navegador reproducir audio. Quien llega por un enlace de WhatsApp y toca aquí
 * desbloquea el sonido de paso (ver `unlockChimes`).
 *
 * Solo gobierna el sonido. La vibración y el título de la pestaña siguen
 * avisando: un cliente en silencio no es un cliente que quiera perderse que su
 * pedido llegó a la puerta.
 */
export function TrackingSoundToggle({ activo, onToggle }: TrackingSoundToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={activo}
      aria-label={activo ? 'Silenciar los avisos' : 'Activar los avisos con sonido'}
      title={activo ? 'Avisos con sonido' : 'Avisos en silencio'}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
        activo ? 'bg-brand-soft text-brand-dark' : 'bg-ink/[0.06] text-ink-subtle'
      }`}
    >
      <Icon name={activo ? 'notifications_active' : 'notifications_off'} size={20} />
    </button>
  )
}
