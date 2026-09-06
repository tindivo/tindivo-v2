'use client'

import { useCallback, useEffect, useState } from 'react'
import { type EstadoPush, estadoPush, pedirPermiso } from '@/lib/push'

export interface AlertChannel {
  estado: EstadoPush
  /** `true` mientras el diálogo del navegador está en pantalla. */
  activando: boolean
  /** Pide el permiso. **Solo desde el manejador de un toque.** */
  activar: () => void
}

/**
 * Por dónde le va a llegar el aviso al cliente, en vivo.
 *
 * `Notification.permission` NO es reactivo: no hay evento que avise de que
 * cambió, y puede cambiar sin que la app se entere de nada —el cliente entra a
 * los ajustes del sitio y desbloquea, o revoca—. Por eso se relee al volver a
 * la pestaña, que es justo el momento después de esa visita a los ajustes.
 *
 * En el primer render el estado es `'no-soportado'` a propósito: el HTML del
 * servidor no puede saber qué permiso tiene este navegador, y adivinarlo
 * produciría un desajuste de hidratación. Se resuelve en el primer efecto.
 */
export function useAlertChannel(): AlertChannel {
  const [estado, setEstado] = useState<EstadoPush>('no-soportado')
  const [activando, setActivando] = useState(false)

  useEffect(() => {
    const releer = () => setEstado(estadoPush())
    releer()
    const alVolver = () => {
      if (document.visibilityState === 'visible') releer()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  const activar = useCallback(() => {
    setActivando(true)
    // Sin `await` delante: el permiso solo se puede pedir dentro del gesto del
    // usuario, y un `await` previo rompe ese gesto.
    void pedirPermiso().finally(() => {
      setActivando(false)
      setEstado(estadoPush())
    })
  }, [])

  return { estado, activando, activar }
}
