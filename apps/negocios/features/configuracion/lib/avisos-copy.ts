import type { PushStatus } from '@/hooks/use-push-status'

/** Cómo se enseña cada estado de los avisos. Ver `avisosVista`. */
export interface AvisosVista {
  icon: string
  tono: string
  titulo: string
  detalle: string
  /** Texto del botón, o `null` si desde aquí no hay nada que hacer. */
  accion: string | null
}

/**
 * QUÉ SE LE DICE A LA CAJERA EN CADA ESTADO, Y CUÁNDO SE LE OFRECE UN BOTÓN.
 *
 * Vive aparte del JSX porque tiene una regla que conviene poder comprobar sin
 * abrir un navegador: **con el permiso bloqueado (`denied`) NO puede haber
 * botón**. Una vez bloqueado, `Notification.requestPermission()` ya no vuelve a
 * preguntar —resuelve `denied` al instante y sin diálogo—, así que un botón ahí
 * no haría absolutamente nada. Ofrecerlo sería peor que no tenerlo: la persona
 * lo pulsa, no pasa nada visible, y se queda creyendo que ya está arreglado
 * mientras sigue sin recibir avisos. En ese estado lo único útil es el camino a
 * los ajustes del navegador, así que es lo que se da.
 *
 * `unsupported` tampoco lleva botón, por lo mismo: no hay nada que activar.
 *
 * Los tres estados accionables son los tres que sí se arreglan desde aquí, y el
 * de en medio —`granted`— es el que motivó todo esto: permiso concedido y token
 * sin registrar. Se veía exactamente igual que un equipo sano.
 */
export function avisosVista(status: PushStatus): AvisosVista {
  switch (status) {
    case 'subscribed':
      return {
        icon: 'check_circle',
        tono: 'bg-success-soft text-emerald-900',
        titulo: 'Este equipo recibe avisos',
        detalle: 'Te llegará una notificación cuando entre un pedido, aunque cierres el panel.',
        accion: null,
      }
    case 'granted':
      return {
        icon: 'sync_problem',
        tono: 'bg-warning-soft text-amber-900',
        titulo: 'Diste permiso, pero este equipo no está registrado',
        detalle: 'Los avisos no van a llegar hasta que lo actives. Suele pasar tras reiniciar.',
        accion: 'Registrar este equipo',
      }
    case 'default':
      return {
        icon: 'notifications_off',
        tono: 'bg-warning-soft text-amber-900',
        titulo: 'Este equipo no recibe avisos',
        detalle: 'Sin avisos, un pedido puede cancelarse solo sin que nadie se entere.',
        accion: 'Activar avisos',
      }
    case 'denied':
      return {
        icon: 'block',
        tono: 'bg-danger-soft text-danger',
        titulo: 'Los avisos están bloqueados',
        detalle:
          'Se bloquearon desde el navegador y no se pueden reactivar desde aquí. Entra a los ajustes del navegador, busca Notificaciones y permite este sitio.',
        accion: null,
      }
    case 'unsupported':
      return {
        icon: 'info',
        tono: 'bg-ink/[0.06] text-ink-muted',
        titulo: 'Este navegador no admite avisos',
        detalle: 'El sonido del panel sigue funcionando mientras lo tengas abierto.',
        accion: null,
      }
  }
}
